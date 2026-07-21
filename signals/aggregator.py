import math

BUY = "BUY"
SELL = "SELL"
WATCH = "WATCH"


def aggregate_signal(indicators):
    """Combine technical indicators into a single BUY/SELL/WATCH call with reasons.

    Score ranges from -3 to +3: +/-1 for price vs VWAP, +/-1 for MA trend,
    +/-1 for RSI extremes. >=2 is a BUY, <=-2 is a SELL, otherwise WATCH.
    """
    price = indicators["price"]
    vwap = indicators["vwap"]
    ma_fast = indicators["ma_fast"]
    ma_slow = indicators["ma_slow"]
    rsi = indicators["rsi"]

    score = 0
    reasons = []

    if price > vwap:
        score += 1
        reasons.append("price above VWAP")
    else:
        score -= 1
        reasons.append("price below VWAP")

    if ma_fast > ma_slow:
        score += 1
        reasons.append("fast MA above slow MA (uptrend)")
    else:
        score -= 1
        reasons.append("fast MA below slow MA (downtrend)")

    if not math.isnan(rsi):
        if rsi < 30:
            score += 1
            reasons.append(f"RSI {rsi:.0f} oversold")
        elif rsi > 70:
            score -= 1
            reasons.append(f"RSI {rsi:.0f} overbought")

    if score >= 2:
        signal = BUY
    elif score <= -2:
        signal = SELL
    else:
        signal = WATCH

    return {"signal": signal, "score": score, "reasons": reasons, **indicators}
