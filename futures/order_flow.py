_LARGE_PRINT_SIZE = 20


def compute_tape_signal(trades):
    """Summarize a window of trade prints into order-flow metrics.

    imbalance_ratio is buy volume as a share of total volume (0.5 = neutral,
    >0.5 = buy-side aggression dominant, <0.5 = sell-side).
    """
    if not trades:
        return {
            "buy_volume": 0,
            "sell_volume": 0,
            "volume_delta": 0,
            "imbalance_ratio": 0.5,
            "large_buy_count": 0,
            "large_sell_count": 0,
        }
    buy_volume = sum(t["size"] for t in trades if t["side"] == "buy")
    sell_volume = sum(t["size"] for t in trades if t["side"] == "sell")
    total = buy_volume + sell_volume
    large_buy = sum(1 for t in trades if t["side"] == "buy" and t["size"] >= _LARGE_PRINT_SIZE)
    large_sell = sum(1 for t in trades if t["side"] == "sell" and t["size"] >= _LARGE_PRINT_SIZE)
    return {
        "buy_volume": buy_volume,
        "sell_volume": sell_volume,
        "volume_delta": buy_volume - sell_volume,
        "imbalance_ratio": buy_volume / total if total else 0.5,
        "large_buy_count": large_buy,
        "large_sell_count": large_sell,
    }


def compute_depth_signal(depth):
    """Read the current DOM: spread, resting-size imbalance, and the
    largest resting bid/ask. This is a level to watch, never treated as
    guaranteed support/resistance — size on the book can be pulled or
    spoofed at any moment.
    """
    bids, asks = depth.get("bids", []), depth.get("asks", [])
    if not bids or not asks:
        return {
            "best_bid": None,
            "best_ask": None,
            "spread": None,
            "bid_volume": 0,
            "ask_volume": 0,
            "depth_imbalance": 0.5,
            "largest_bid": None,
            "largest_ask": None,
        }
    best_bid, best_ask = bids[0][0], asks[0][0]
    bid_volume = sum(v for _, v in bids)
    ask_volume = sum(v for _, v in asks)
    total = bid_volume + ask_volume
    return {
        "best_bid": best_bid,
        "best_ask": best_ask,
        "spread": round(best_ask - best_bid, 4),
        "bid_volume": bid_volume,
        "ask_volume": ask_volume,
        "depth_imbalance": bid_volume / total if total else 0.5,
        "largest_bid": max(bids, key=lambda kv: kv[1]),
        "largest_ask": max(asks, key=lambda kv: kv[1]),
    }


def detect_absorption(recent_closes, tape, side):
    """Absorption: aggressive volume hits a level repeatedly but price
    fails to move through it — the passive side is absorbing the flow.
    `side` is 'support' (absorbing sell-side aggression) or 'resistance'
    (absorbing buy-side aggression).
    """
    if len(recent_closes) < 5 or not tape:
        return False
    window = recent_closes[-5:]
    price_range = max(window) - min(window)
    tight_range = price_range < window[-1] * 0.0008
    if side == "support":
        return tape["sell_volume"] > tape["buy_volume"] * 1.5 and tight_range
    return tape["buy_volume"] > tape["sell_volume"] * 1.5 and tight_range
