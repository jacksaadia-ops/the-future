from futures import config


def _find_swings(df, lookback):
    """A bar is a swing high/low if it equals the max/min of the window
    centered on it (lookback bars either side). Vectorized via a centered
    rolling max/min — equivalent to, but far faster than, checking each
    bar against a fresh slice in a Python loop (this is the hot path in
    the backtest, called once per simulated bar). rolling(center=True)
    naturally leaves the first/last `lookback` bars unmarked (can't center
    a full window there), matching the original loop's excluded range.
    """
    window = 2 * lookback + 1
    roll_max = df["high"].rolling(window, center=True).max()
    roll_min = df["low"].rolling(window, center=True).min()
    is_swing_high = df["high"] == roll_max
    is_swing_low = df["low"] == roll_min
    swing_highs = list(zip(df.index[is_swing_high], df["high"][is_swing_high]))
    swing_lows = list(zip(df.index[is_swing_low], df["low"][is_swing_low]))
    return swing_highs, swing_lows


def _detect_liquidity_sweep(df, swing_highs, swing_lows, recent_bars=5):
    """A sweep: recent price action pierces a prior swing point on the wick
    but closes back on the other side of it — the classic stop-run /
    trapped-breakout signature, distinct from genuine continuation.
    """
    recent = df.tail(recent_bars)
    if swing_highs:
        level = swing_highs[-1][1]
        if ((recent["high"] > level) & (recent["close"] < level)).any():
            return {"side": "high", "level": level}
    if swing_lows:
        level = swing_lows[-1][1]
        if ((recent["low"] < level) & (recent["close"] > level)).any():
            return {"side": "low", "level": level}
    return None


def analyze_market_structure(df, lookback=None):
    """Classify trend from swing highs/lows and flag the most recent
    break-of-structure / change-of-character / liquidity-sweep event.
    """
    lookback = lookback or config.SWING_LOOKBACK
    if len(df) < lookback * 2 + 3:
        return {
            "trend": "UNCLEAR",
            "last_swing_high": None,
            "last_swing_low": None,
            "swing_highs": [],
            "swing_lows": [],
            "break_of_structure": False,
            "change_of_character": False,
            "liquidity_sweep": None,
        }

    swing_highs, swing_lows = _find_swings(df, lookback)

    trend = "UNCLEAR"
    if len(swing_highs) >= 2 and len(swing_lows) >= 2:
        higher_highs = swing_highs[-1][1] > swing_highs[-2][1]
        higher_lows = swing_lows[-1][1] > swing_lows[-2][1]
        lower_highs = swing_highs[-1][1] < swing_highs[-2][1]
        lower_lows = swing_lows[-1][1] < swing_lows[-2][1]
        if higher_highs and higher_lows:
            trend = "UPTREND"
        elif lower_highs and lower_lows:
            trend = "DOWNTREND"
        else:
            trend = "CONSOLIDATION"

    last_close = df["close"].iloc[-1]
    last_swing_high = swing_highs[-1][1] if swing_highs else None
    last_swing_low = swing_lows[-1][1] if swing_lows else None

    break_of_structure = (
        (trend == "UPTREND" and last_swing_high is not None and last_close > last_swing_high)
        or (trend == "DOWNTREND" and last_swing_low is not None and last_close < last_swing_low)
    )
    change_of_character = (
        (trend == "UPTREND" and last_swing_low is not None and last_close < last_swing_low)
        or (trend == "DOWNTREND" and last_swing_high is not None and last_close > last_swing_high)
    )

    return {
        "trend": trend,
        "last_swing_high": last_swing_high,
        "last_swing_low": last_swing_low,
        # Full swing history (not just the last point) so target selection
        # can aim at the nearest real structure instead of an arbitrary
        # risk multiple — see setup_engine._select_targets.
        "swing_highs": [price for _, price in swing_highs],
        "swing_lows": [price for _, price in swing_lows],
        "break_of_structure": break_of_structure,
        "change_of_character": change_of_character,
        "liquidity_sweep": _detect_liquidity_sweep(df, swing_highs, swing_lows),
    }
