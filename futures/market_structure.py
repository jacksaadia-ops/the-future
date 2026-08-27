from futures import config


def _find_swings(df, lookback):
    highs, lows = df["high"], df["low"]
    swing_highs, swing_lows = [], []
    n = len(df)
    for i in range(lookback, n - lookback):
        window_h = highs.iloc[i - lookback : i + lookback + 1]
        if highs.iloc[i] == window_h.max():
            swing_highs.append((df.index[i], highs.iloc[i]))
        window_l = lows.iloc[i - lookback : i + lookback + 1]
        if lows.iloc[i] == window_l.min():
            swing_lows.append((df.index[i], lows.iloc[i]))
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
        "break_of_structure": break_of_structure,
        "change_of_character": change_of_character,
        "liquidity_sweep": _detect_liquidity_sweep(df, swing_highs, swing_lows),
    }
