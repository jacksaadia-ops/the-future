CUSTOM_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

html, body, [class*="css"] {
    font-family: 'JetBrains Mono', monospace;
}

.stApp {
    background: radial-gradient(circle at 15% -10%, #0f1b2b 0%, #05070c 55%, #030407 100%);
    color: #d7e6f5;
}

h1 {
    font-family: 'Orbitron', sans-serif;
    font-weight: 800;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    background: linear-gradient(90deg, #00f5ff 0%, #4dff9e 60%, #00f5ff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 0 30px rgba(0, 245, 255, 0.25);
}

h4 {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #9fd7ff;
    text-transform: uppercase;
}

/* Symbol cards */
div[data-testid="stColumn"] {
    background: linear-gradient(180deg, rgba(0,245,255,0.035), rgba(255,255,255,0.01));
    border: 1px solid rgba(0, 245, 255, 0.18);
    border-radius: 12px;
    padding: 18px 12px 8px 12px;
    box-shadow: 0 0 20px rgba(0, 245, 255, 0.05), inset 0 0 40px rgba(0, 245, 255, 0.02);
}

[data-testid="stMetricValue"] {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 1.3rem !important;
    color: #f2f8ff;
    text-shadow: 0 0 14px rgba(255, 255, 255, 0.18);
    overflow: visible !important;
    text-overflow: unset !important;
    white-space: nowrap !important;
}

[data-testid="stMetricLabel"] {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.68rem;
    color: #6f8ba8;
}

[data-testid="stCaptionContainer"], .stCaption {
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.01em;
    color: #8fa8c2 !important;
}

[data-testid="stAlert"] {
    background: rgba(0, 245, 255, 0.05);
    border: 1px solid rgba(0, 245, 255, 0.28);
    border-radius: 10px;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.03em;
    box-shadow: 0 0 22px rgba(0, 245, 255, 0.08);
}

.signal-badge {
    display: inline-block;
    padding: 3px 12px;
    border-radius: 5px;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 1.1em;
    letter-spacing: 0.08em;
}

.signal-buy {
    color: #1a1f1a;
    background: #34ffa0;
    box-shadow: 0 0 16px rgba(52, 255, 160, 0.55);
}

.signal-sell {
    color: #200b0f;
    background: #ff4d6a;
    box-shadow: 0 0 16px rgba(255, 77, 106, 0.55);
}

.signal-watch {
    color: #241c05;
    background: #ffc93c;
    box-shadow: 0 0 16px rgba(255, 201, 60, 0.45);
}
"""
