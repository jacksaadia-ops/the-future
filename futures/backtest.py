"""Structure-only backtest of the setup engine's trigger + target logic.

IMPORTANT LIMITATION: ProjectX's historical API only provides OHLCV bars —
no historical time & sales or DOM. So this can only replay the
market-structure half of the engine (liquidity sweep + reclaim, break of
structure) and the target-selection logic. It cannot replay the order-flow
confirmation votes (tape imbalance, large prints, DOM imbalance) that the
live dashboard also requires before calling a TRADE ALERT — those need
historical tick data this API doesn't expose. Treat these results as the
base rate of the structural trigger alone, a lower bound on what the live,
more-selective system should do — not a backtest of the live system as a
whole.

No lookahead: at each simulated "now" bar, only bars up to and including
that bar are visible to market_structure/key_levels, matching what the
live dashboard would have actually seen at that point in time.
"""

import pandas as pd

from futures import config
from futures.key_levels import compute_key_levels
from futures.market_structure import analyze_market_structure
from futures.setup_engine import select_targets

# Trailing bars fed into market_structure/key_levels at each simulated
# "now" — not the full history, both for speed (recomputing swings from
# scratch on a growing multi-week window is O(n^2)) and because session/
# overnight/prior-session levels only need roughly the last day or two
# anyway. Near the start of a session this window may not yet contain the
# full prior session, in which case those levels just come back NaN/unused
# for that bar, same as the live dashboard on a cold start.
WINDOW_BARS = 600
MAX_HOLD_BARS = 360  # ~6 hours of 1-min bars — cap on how long a simulated trade stays open
STOP_TICKS = {"Liquidity Sweep Reversal": 4, "Break of Structure Continuation": 6}


def _detect_trigger(structure, price):
    sweep = structure["liquidity_sweep"]
    if sweep is not None:
        if sweep["side"] == "low" and price > sweep["level"]:
            return "LONG", "Liquidity Sweep Reversal", sweep["level"]
        if sweep["side"] == "high" and price < sweep["level"]:
            return "SHORT", "Liquidity Sweep Reversal", sweep["level"]
    if structure["break_of_structure"]:
        if structure["trend"] == "UPTREND":
            return "LONG", "Break of Structure Continuation", structure["last_swing_high"]
        if structure["trend"] == "DOWNTREND":
            return "SHORT", "Break of Structure Continuation", structure["last_swing_low"]
    return None


def _resolve_trade(df, entry_idx, direction, entry_price, stop, targets):
    """Walk forward bar by bar. Primary outcome is whichever of {stop, T1}
    is touched first (same-bar ambiguity is resolved conservatively in
    favor of the stop). Also separately tracks, purely for informational
    stats, the furthest target (T1/T2/T3) touched before the original stop
    or the hold-period timeout — i.e. "how often would letting it run
    further have paid off," without changing the primary win/loss call.
    """
    targets_up = direction == "LONG"
    t1, t2, t3 = targets
    risk = abs(entry_price - stop)
    n = len(df)
    end = min(n, entry_idx + 1 + MAX_HOLD_BARS)

    primary = None  # "win" | "loss" | "timeout"
    exit_price = None
    exit_idx = None
    max_target_reached = 0

    for j in range(entry_idx + 1, end):
        bar = df.iloc[j]
        if targets_up:
            hit_stop = bar["low"] <= stop
            hit = [bar["high"] >= t for t in (t1, t2, t3)]
        else:
            hit_stop = bar["high"] >= stop
            hit = [bar["low"] <= t for t in (t1, t2, t3)]

        if primary is None:
            if hit_stop:
                primary, exit_price, exit_idx = "loss", stop, j
            elif hit[0]:
                primary, exit_price, exit_idx = "win", t1, j

        # Informational furthest-target tracking continues independently,
        # stopping once the ORIGINAL stop is hit (whether or not that
        # determined the primary outcome) or the loop ends.
        if hit_stop:
            break
        if hit[2]:
            max_target_reached = 3
            break
        if hit[1]:
            max_target_reached = 2
        elif hit[0]:
            max_target_reached = max(max_target_reached, 1)

    if primary is None:
        # Neither stop nor T1 touched within the hold window — mark to market.
        exit_idx = end - 1
        exit_price = df.iloc[exit_idx]["close"]
        primary = "timeout"

    r_multiple = (exit_price - entry_price) / risk if targets_up else (entry_price - exit_price) / risk
    return {
        "outcome": primary,
        "exit_index": exit_idx,
        "exit_time": df.index[exit_idx],
        "exit_price": exit_price,
        "r_multiple": r_multiple,
        "max_target_reached": max_target_reached,
    }


def simulate_trades(df, ticker, swing_lookback=None):
    """Replay the structural trigger + target logic over historical bars.
    One trade at a time per ticker — a new signal isn't considered while a
    simulated trade is still open, matching how the live dashboard is used.
    """
    swing_lookback = swing_lookback or config.SWING_LOOKBACK
    tick = config.TICK_SIZE[ticker]
    min_bars = swing_lookback * 2 + 3
    trades = []

    i = min_bars
    n = len(df)
    while i < n:
        start = max(0, i - WINDOW_BARS + 1)
        window = df.iloc[start : i + 1]
        structure = analyze_market_structure(window, lookback=swing_lookback)
        price = window["close"].iloc[-1]

        trigger = _detect_trigger(structure, price)
        if trigger is None:
            i += 1
            continue

        direction, setup_name, level = trigger
        targets_up = direction == "LONG"
        stop = level - tick * STOP_TICKS[setup_name] if targets_up else level + tick * STOP_TICKS[setup_name]
        risk = abs(price - stop)
        if risk <= 0:
            i += 1
            continue

        key_levels = compute_key_levels(window)
        targets = select_targets(price, risk, targets_up, structure, key_levels)

        outcome = _resolve_trade(df, i, direction, price, stop, targets)
        trades.append(
            {
                "ticker": ticker,
                "setup": setup_name,
                "direction": direction,
                "entry_time": window.index[-1],
                "entry_price": price,
                "stop": stop,
                "targets": targets,
                **outcome,
            }
        )
        i = outcome["exit_index"] + 1

    return trades


def summarize(trades):
    if not trades:
        return {"count": 0}

    df = pd.DataFrame(trades)
    wins = df[df["outcome"] == "win"]
    losses = df[df["outcome"] == "loss"]
    timeouts = df[df["outcome"] == "timeout"]

    return {
        "count": len(df),
        "wins": len(wins),
        "losses": len(losses),
        "timeouts": len(timeouts),
        "win_rate": len(wins) / len(df) if len(df) else float("nan"),
        "avg_r": df["r_multiple"].mean(),
        "expectancy_r": df["r_multiple"].mean(),
        "total_r": df["r_multiple"].sum(),
        "max_drawdown_r": _max_drawdown(df["r_multiple"].cumsum()),
        "t2_or_better_rate": (df["max_target_reached"] >= 2).mean(),
        "t3_rate": (df["max_target_reached"] >= 3).mean(),
        "by_setup": df.groupby("setup")["r_multiple"].agg(["count", "mean"]).to_dict("index"),
        "by_direction": df.groupby("direction")["r_multiple"].agg(["count", "mean"]).to_dict("index"),
    }


def _max_drawdown(equity_curve):
    running_max = equity_curve.cummax()
    drawdown = equity_curve - running_max
    return drawdown.min() if len(drawdown) else 0.0
