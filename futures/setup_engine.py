import pandas as pd

from futures import config


def _confidence(votes_for, votes_total):
    if votes_total == 0:
        return "LOW"
    ratio = votes_for / votes_total
    if ratio >= 0.85 and votes_for >= 3:
        return "HIGH"
    if ratio >= 0.6:
        return "MEDIUM"
    return "LOW"


def evaluate_setup(ticker, price, structure, key_levels, tape, depth, risk_warnings):
    """Confluence engine: requires market structure + order flow + a defined
    level to align before calling anything more than NO TRADE / a level to
    watch. Returns a dict tagged with `kind` in
    {"trade_alert", "level_to_watch", "no_trade", "market_unclear"}.
    """
    tick = config.TICK_SIZE[ticker]

    if structure["trend"] == "UNCLEAR" or price is None:
        return {
            "kind": "market_unclear",
            "ticker": ticker,
            "reason": "Not enough bar history yet to read market structure.",
        }

    sweep = structure["liquidity_sweep"]

    # --- Setup 1: liquidity sweep + reclaim (mean-reversion) ---
    if sweep is not None:
        level = sweep["level"]
        if sweep["side"] == "low" and price > level:
            votes = [
                tape["imbalance_ratio"] > 0.55,
                depth["depth_imbalance"] > 0.52,
                tape["large_buy_count"] >= tape["large_sell_count"],
                structure["trend"] != "DOWNTREND",
            ]
            return _build_result(
                ticker, "LONG", "Liquidity Sweep Reversal", price, level, votes,
                stop=level - tick * 4, targets_up=True, structure=structure,
                tape=tape, depth=depth, risk_warnings=risk_warnings,
            )
        if sweep["side"] == "high" and price < level:
            votes = [
                tape["imbalance_ratio"] < 0.45,
                depth["depth_imbalance"] < 0.48,
                tape["large_sell_count"] >= tape["large_buy_count"],
                structure["trend"] != "UPTREND",
            ]
            return _build_result(
                ticker, "SHORT", "Liquidity Sweep Reversal", price, level, votes,
                stop=level + tick * 4, targets_up=False, structure=structure,
                tape=tape, depth=depth, risk_warnings=risk_warnings,
            )

    # --- Setup 2: break-of-structure continuation ---
    if structure["break_of_structure"]:
        vwap_ok = pd.isna(key_levels["vwap"])  # NaN vwap shouldn't block the setup
        if structure["trend"] == "UPTREND":
            level = structure["last_swing_high"]
            votes = [
                tape["imbalance_ratio"] > 0.58,
                depth["depth_imbalance"] > 0.5,
                tape["large_buy_count"] > tape["large_sell_count"],
                vwap_ok or price > key_levels["vwap"],
            ]
            return _build_result(
                ticker, "LONG", "Break of Structure Continuation", price, level, votes,
                stop=level - tick * 6, targets_up=True, structure=structure,
                tape=tape, depth=depth, risk_warnings=risk_warnings,
            )
        else:
            level = structure["last_swing_low"]
            votes = [
                tape["imbalance_ratio"] < 0.42,
                depth["depth_imbalance"] < 0.5,
                tape["large_sell_count"] > tape["large_buy_count"],
                vwap_ok or price < key_levels["vwap"],
            ]
            return _build_result(
                ticker, "SHORT", "Break of Structure Continuation", price, level, votes,
                stop=level + tick * 6, targets_up=False, structure=structure,
                tape=tape, depth=depth, risk_warnings=risk_warnings,
            )

    key_level = structure["last_swing_high"] or structure["last_swing_low"]
    return {
        "kind": "no_trade",
        "ticker": ticker,
        "reason": f"No liquidity sweep or structure break in play — {structure['trend'].lower()}, "
        "chopping without a clean trigger.",
        "key_level": key_level,
        "what_would_change": "A liquidity sweep with reclaim, or a break of structure confirmed by order flow.",
    }


def _build_result(ticker, direction, setup_name, price, level, votes, stop, targets_up, structure, tape, depth, risk_warnings):
    votes_for = sum(1 for v in votes if v)
    votes_total = len(votes)

    if votes_for < 2:
        return {
            "kind": "level_to_watch",
            "ticker": ticker,
            "direction": direction,
            "setup": setup_name,
            "level": level,
            "reason": "Level is in play but order flow doesn't confirm yet.",
        }

    confidence = _confidence(votes_for, votes_total)
    risk = abs(price - stop)
    if targets_up:
        targets = [price + risk, price + risk * 2, price + risk * 3]
    else:
        targets = [price - risk, price - risk * 2, price - risk * 3]

    return {
        "kind": "trade_alert",
        "ticker": ticker,
        "direction": direction,
        "setup": setup_name,
        "entry": price,
        "stop": stop,
        "targets": targets,
        "confidence": confidence,
        "market_structure": f"{structure['trend']} — {'break of structure' if structure['break_of_structure'] else 'liquidity sweep'} at {level:.2f}",
        "order_flow": f"Tape {tape['imbalance_ratio']:.0%} buy-side, {tape['large_buy_count']} large buy / {tape['large_sell_count']} large sell prints",
        "level2": (
            f"DOM {depth['depth_imbalance']:.0%} bid-side, spread {depth['spread']}"
            if depth["spread"] is not None
            else "DOM unavailable"
        ),
        "time_and_sales": f"Volume delta {tape['volume_delta']:+,}",
        "thesis": f"{setup_name} on {ticker}: {direction.lower()} against {level:.2f} with order flow confirming.",
        "invalidation": f"Close back {'below' if targets_up else 'above'} {stop:.2f}",
        "execution_note": "Manual execution only — confirm fill and slippage before sizing up.",
        "risk_warnings": risk_warnings,
    }
