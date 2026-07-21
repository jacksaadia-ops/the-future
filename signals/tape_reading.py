_IMBALANCE_THRESHOLD = 0.62
_LARGE_PRINT_MIN_COUNT = 2


def compute_tape_signal(prints):
    """Summarize a window of trade prints into order-flow metrics.

    imbalance_ratio is buy volume as a share of total volume (0.5 = neutral,
    >0.5 = buy-side aggression dominant, <0.5 = sell-side).
    """
    if not prints:
        return {
            "buy_volume": 0,
            "sell_volume": 0,
            "volume_delta": 0,
            "imbalance_ratio": 0.5,
            "large_buy_count": 0,
            "large_sell_count": 0,
        }

    buy_volume = sum(p["size"] for p in prints if p["side"] == "buy")
    sell_volume = sum(p["size"] for p in prints if p["side"] == "sell")
    total_volume = buy_volume + sell_volume
    large_buy_count = sum(1 for p in prints if p["side"] == "buy" and p["large"])
    large_sell_count = sum(1 for p in prints if p["side"] == "sell" and p["large"])

    return {
        "buy_volume": buy_volume,
        "sell_volume": sell_volume,
        "volume_delta": buy_volume - sell_volume,
        "imbalance_ratio": buy_volume / total_volume if total_volume else 0.5,
        "large_buy_count": large_buy_count,
        "large_sell_count": large_sell_count,
    }
