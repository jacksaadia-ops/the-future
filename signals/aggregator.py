import math

BUY = "BUY"
SELL = "SELL"
WATCH = "WATCH"


_PUT_CALL_BULLISH = 0.7
_PUT_CALL_BEARISH = 1.3
_TICK_EXTREME = 800
_ADD_THRESHOLD = 800
_VIX_CHANGE_THRESHOLD = 1.5


def aggregate_signal(indicators, tape=None, options=None, internals=None):
    """Combine technical, tape, options-flow, and market-internals signals into a call.

    Technical score ranges +/-3 (VWAP, MA trend, RSI extremes). Tape adds up to
    +/-2 more (order-flow imbalance, large-print bias). Options adds up to +/-2
    more (put/call ratio, unusual volume). Internals adds up to +/-3 more
    (TICK extremes, breadth, VIX change) and is shared market-wide context
    rather than symbol-specific. >=5 is a BUY, <=-5 is a SELL, otherwise WATCH.
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

    if tape is not None:
        imbalance = tape["imbalance_ratio"]
        if imbalance > 0.62:
            score += 1
            reasons.append(f"order flow buy-heavy ({imbalance:.0%} buy)")
        elif imbalance < 0.38:
            score -= 1
            reasons.append(f"order flow sell-heavy ({1 - imbalance:.0%} sell)")

        large_buy = tape["large_buy_count"]
        large_sell = tape["large_sell_count"]
        if large_buy > large_sell and large_buy >= 2:
            score += 1
            reasons.append(f"{large_buy} large buy prints")
        elif large_sell > large_buy and large_sell >= 2:
            score -= 1
            reasons.append(f"{large_sell} large sell prints")

    if options is not None:
        put_call_ratio = options["put_call_ratio"]
        if put_call_ratio < _PUT_CALL_BULLISH:
            score += 1
            reasons.append(f"call-heavy options flow (P/C {put_call_ratio:.2f})")
        elif put_call_ratio > _PUT_CALL_BEARISH:
            score -= 1
            reasons.append(f"put-heavy options flow (P/C {put_call_ratio:.2f})")

        if options["unusual_call_volume"]:
            score += 1
            reasons.append("unusual call volume")
        if options["unusual_put_volume"]:
            score -= 1
            reasons.append("unusual put volume")

    if internals is not None:
        tick = internals["tick"]
        add = internals["add"]
        vix_change = internals["vix_change"]

        if tick > _TICK_EXTREME:
            score += 1
            reasons.append(f"TICK extremely positive ({tick:+d}, broad buying)")
        elif tick < -_TICK_EXTREME:
            score -= 1
            reasons.append(f"TICK extremely negative ({tick:+d}, broad selling)")

        if add > _ADD_THRESHOLD:
            score += 1
            reasons.append(f"advancers leading (ADD {add:+d}, breadth bullish)")
        elif add < -_ADD_THRESHOLD:
            score -= 1
            reasons.append(f"decliners leading (ADD {add:+d}, breadth bearish)")

        if vix_change > _VIX_CHANGE_THRESHOLD:
            score -= 1
            reasons.append(f"VIX rising ({vix_change:+.1f}, risk-off)")
        elif vix_change < -_VIX_CHANGE_THRESHOLD:
            score += 1
            reasons.append(f"VIX falling ({vix_change:+.1f}, risk-on)")

    if score >= 5:
        signal = BUY
    elif score <= -5:
        signal = SELL
    else:
        signal = WATCH

    return {
        "signal": signal,
        "score": score,
        "reasons": reasons,
        **indicators,
        **(tape or {}),
        **(options or {}),
        **(internals or {}),
    }
