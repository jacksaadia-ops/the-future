import html

_PANEL_STYLE = {
    "trade_alert": ("hud-panel--trade", "TRADE ALERT"),
    "level_to_watch": ("hud-panel--watch", "LEVEL TO WATCH — NOT AN ENTRY"),
    "no_trade": ("hud-panel--no-trade", "NO TRADE"),
    "market_unclear": ("hud-panel--unclear", "MARKET UNCLEAR — STAND ASIDE"),
    "setup_invalid": ("hud-panel--invalid", "SETUP INVALID — DO NOT ENTER"),
    "target_reached": ("hud-panel--reached", "TARGET REACHED"),
}


def render_alert_html(alert):
    """HUD-styled version of format_alert()'s text for st.markdown(unsafe_allow_html=True).

    Strips the leading label line (it becomes the colored badge instead)
    and escapes the rest, since it's rendered as raw HTML.
    """
    css_class, tag = _PANEL_STYLE.get(alert["kind"], ("hud-panel--no-trade", alert["kind"]))
    text = format_alert(alert)
    body = text.split("\n", 1)[1] if "\n" in text else ""
    return (
        f'<div class="hud-panel {css_class}">'
        f'<span class="hud-tag">{html.escape(tag)}</span>\n'
        f"{html.escape(body)}"
        f"</div>"
    )


def format_alert(alert):
    kind = alert["kind"]

    if kind == "trade_alert":
        t1, t2, t3 = alert["targets"]
        warning_block = (
            "\n\n⚠️ RISK WARNING: " + " | ".join(alert["risk_warnings"]) if alert["risk_warnings"] else ""
        )
        return (
            "TRADE ALERT\n"
            f"Contract: {alert['ticker']}\n"
            f"Direction: {alert['direction']}\n"
            f"Setup: {alert['setup']}\n"
            f"Entry: {alert['entry']:.2f}\n"
            f"Stop: {alert['stop']:.2f}\n"
            f"Target 1: {t1:.2f}\n"
            f"Target 2: {t2:.2f}\n"
            f"Target 3: {t3:.2f}\n"
            "Risk/Reward: 1:1 / 1:2 / 1:3 (T1/T2/T3)\n"
            f"Confidence: {alert['confidence']}\n"
            f"Market Structure: {alert['market_structure']}\n"
            f"Order Flow: {alert['order_flow']}\n"
            f"Level 2: {alert['level2']}\n"
            f"Time & Sales: {alert['time_and_sales']}\n"
            f"Trade Thesis: {alert['thesis']}\n"
            f"Invalidation: {alert['invalidation']}\n"
            f"Execution Note: {alert['execution_note']}"
            f"{warning_block}"
        )

    if kind == "level_to_watch":
        return (
            "LEVEL TO WATCH (not a trade entry)\n"
            f"Contract: {alert['ticker']}\n"
            f"Direction bias: {alert['direction']}\n"
            f"Setup: {alert['setup']}\n"
            f"Level: {alert['level']:.2f}\n"
            f"Reason: {alert['reason']}"
        )

    if kind == "no_trade":
        key_level = f"{alert['key_level']:.2f}" if alert.get("key_level") is not None else "n/a"
        return (
            "NO TRADE\n"
            f"Reason: {alert['reason']}\n"
            f"Key Level: {key_level}\n"
            f"What Would Change My Mind: {alert['what_would_change']}"
        )

    if kind == "market_unclear":
        return f"MARKET UNCLEAR — STAND ASIDE\n{alert['reason']}"

    if kind == "setup_invalid":
        return f"SETUP INVALID — DO NOT ENTER\n{alert['ticker']} {alert['setup']} thesis is no longer valid."

    if kind == "target_reached":
        return f"TARGET REACHED\n{alert['ticker']} {alert['setup']} hit Target 1 ({alert['target']:.2f})."

    return ""
