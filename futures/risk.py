from futures import config


def check_risk_limits(account):
    """Return warning strings if taking another trade could put the
    account at risk of violating its predefined daily-loss or
    position-size rules. Never a hard block — the human executes every
    trade and makes the final call — just a required warning per the spec.
    """
    warnings = []
    daily_pnl = account.get("daily_pnl")
    open_size = account.get("open_position_size", 0)

    if daily_pnl is not None and daily_pnl <= -config.MAX_DAILY_LOSS * 0.8:
        warnings.append(
            f"Daily P&L {daily_pnl:+.0f} is within 20% of your max daily loss limit "
            f"(-{config.MAX_DAILY_LOSS:.0f}). Taking another loss could breach it."
        )
    if open_size >= config.MAX_POSITION_SIZE:
        warnings.append(
            f"Current position size ({open_size}) is already at your max "
            f"({config.MAX_POSITION_SIZE}). Adding here would violate your position-size rule."
        )
    return warnings
