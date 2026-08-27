from futures import config


def _fmt(label, value):
    return f"{label}: {value:.2f}" if value == value else f"{label}: n/a"  # NaN != NaN


def build_game_plan(ticker, key_levels, structure):
    lines = [f"=== {ticker} Pre-Market Game Plan ==="]
    lines.append(_fmt("VWAP", key_levels["vwap"]))
    lines.append(_fmt("Session High", key_levels["session_high"]))
    lines.append(_fmt("Session Low", key_levels["session_low"]))
    lines.append(_fmt("Overnight High", key_levels["overnight_high"]))
    lines.append(_fmt("Overnight Low", key_levels["overnight_low"]))
    lines.append(_fmt("Previous Session High", key_levels["prev_session_high"]))
    lines.append(_fmt("Previous Session Low", key_levels["prev_session_low"]))
    lines.append(_fmt("Opening Range High", key_levels["opening_range_high"]))
    lines.append(_fmt("Opening Range Low", key_levels["opening_range_low"]))
    lines.append(f"Structure: {structure['trend']}")
    lines.append(
        "Scenario: holding above VWAP and session low favors long continuation; "
        "a clean break and reclaim of session low/high on order-flow confirmation "
        "invalidates the range and opens the opposite side."
    )
    if config.ECONOMIC_EVENTS_TODAY:
        lines.append("Scheduled events (UTC): " + ", ".join(f"{t} {label}" for t, label in config.ECONOMIC_EVENTS_TODAY))
    else:
        lines.append(
            "Scheduled events: none configured — add today's known releases to "
            "config.ECONOMIC_EVENTS_TODAY (no live economic calendar is wired up)."
        )
    return "\n".join(lines)
