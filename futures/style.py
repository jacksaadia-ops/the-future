CUSTOM_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800;900&family=Share+Tech+Mono&family=JetBrains+Mono:wght@400;500;700&display=swap');

:root {
    --cyan: #00e5ff;
    --cyan-dim: #0891a8;
    --cyan-glow: rgba(0, 229, 255, 0.55);
    --amber: #ffb454;
    --amber-glow: rgba(255, 180, 84, 0.5);
    --green: #39ff9e;
    --green-glow: rgba(57, 255, 158, 0.55);
    --red: #ff4466;
    --red-glow: rgba(255, 68, 102, 0.55);
    --ink: #cfe9ff;
    --dim: #6f93b3;
}

html, body, [class*="css"] {
    font-family: 'Share Tech Mono', 'JetBrains Mono', monospace;
}

.stApp {
    background:
        repeating-linear-gradient(0deg, rgba(0, 229, 255, 0.025) 0px, rgba(0, 229, 255, 0.025) 1px, transparent 1px, transparent 48px),
        repeating-linear-gradient(90deg, rgba(0, 229, 255, 0.025) 0px, rgba(0, 229, 255, 0.025) 1px, transparent 1px, transparent 48px),
        radial-gradient(circle at 20% -10%, #0c2233 0%, #050a12 55%, #020407 100%);
    color: var(--ink);
}

/* ---- Header ---- */
h1 {
    font-family: 'Orbitron', sans-serif;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    background: linear-gradient(90deg, var(--cyan) 0%, #7ef7ff 45%, var(--cyan) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 0 40px var(--cyan-glow);
    position: relative;
    padding-bottom: 10px;
}
h1::after {
    content: "";
    position: absolute;
    left: 0; bottom: 0;
    width: 220px; height: 2px;
    background: linear-gradient(90deg, var(--cyan), transparent);
    box-shadow: 0 0 12px var(--cyan-glow);
}

h4 {
    font-family: 'Orbitron', sans-serif;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #9fd7ff;
    text-transform: uppercase;
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.25);
}

[data-testid="stCaptionContainer"], .stCaption {
    font-family: 'Share Tech Mono', monospace;
    letter-spacing: 0.02em;
    color: var(--dim) !important;
}

/* ---- Symbol columns as HUD panels ---- */
div[data-testid="stColumn"] {
    background: linear-gradient(180deg, rgba(0, 229, 255, 0.045), rgba(255, 255, 255, 0.01));
    border: 1px solid rgba(0, 229, 255, 0.22);
    border-radius: 4px;
    padding: 20px 16px 14px 16px;
    box-shadow: 0 0 24px rgba(0, 229, 255, 0.06), inset 0 0 50px rgba(0, 229, 255, 0.02);
    position: relative;
}
/* HUD corner brackets */
div[data-testid="stColumn"]::before, div[data-testid="stColumn"]::after {
    content: "";
    position: absolute;
    width: 14px; height: 14px;
    border-color: var(--cyan);
    opacity: 0.8;
}
div[data-testid="stColumn"]::before {
    top: -1px; left: -1px;
    border-top: 2px solid var(--cyan);
    border-left: 2px solid var(--cyan);
}
div[data-testid="stColumn"]::after {
    bottom: -1px; right: -1px;
    border-bottom: 2px solid var(--cyan);
    border-right: 2px solid var(--cyan);
}

[data-testid="stMetricValue"] {
    font-family: 'Orbitron', sans-serif;
    font-weight: 800;
    font-size: 1.7rem !important;
    color: #f2f8ff;
    text-shadow: 0 0 18px rgba(255, 255, 255, 0.25);
    overflow: visible !important;
    text-overflow: unset !important;
    white-space: nowrap !important;
}
[data-testid="stMetricLabel"] {
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 0.65rem;
    color: var(--cyan-dim);
}

[data-testid="stAlert"] {
    background: rgba(255, 180, 84, 0.06);
    border: 1px solid rgba(255, 180, 84, 0.35);
    border-radius: 4px;
    font-family: 'Share Tech Mono', monospace;
    letter-spacing: 0.02em;
    box-shadow: 0 0 22px rgba(255, 180, 84, 0.1);
}

/* ---- Status pill (top of page) ---- */
.hud-status {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: 'Share Tech Mono', monospace;
    letter-spacing: 0.08em;
    font-size: 0.85rem;
    color: var(--dim);
    margin: 4px 0 18px 0;
}
.hud-dot {
    width: 9px; height: 9px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 8px var(--green), 0 0 16px var(--green-glow);
    animation: hud-pulse 1.6s ease-in-out infinite;
}
.hud-dot.mock {
    background: var(--amber);
    box-shadow: 0 0 8px var(--amber), 0 0 16px var(--amber-glow);
}
@keyframes hud-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(0.75); }
}

/* ---- Alert panels ---- */
.hud-panel {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.92rem;
    line-height: 1.55;
    white-space: pre-wrap;
    border-radius: 4px;
    padding: 16px 18px;
    margin: 6px 0 14px 0;
    position: relative;
    border: 1px solid var(--panel-border, rgba(0, 229, 255, 0.3));
    background: var(--panel-bg, rgba(0, 229, 255, 0.04));
    box-shadow: 0 0 26px var(--panel-glow, rgba(0, 229, 255, 0.12)), inset 0 0 30px rgba(0,0,0,0.25);
    color: var(--ink);
}
.hud-panel .hud-tag {
    display: inline-block;
    font-family: 'Orbitron', sans-serif;
    font-weight: 800;
    letter-spacing: 0.15em;
    font-size: 0.78rem;
    padding: 2px 10px;
    border-radius: 3px;
    margin-bottom: 8px;
    color: #050a12;
    background: var(--panel-border, var(--cyan));
    box-shadow: 0 0 12px var(--panel-glow, var(--cyan-glow));
}

.hud-panel--trade { --panel-border: var(--green); --panel-bg: rgba(57, 255, 158, 0.06); --panel-glow: var(--green-glow); }
.hud-panel--watch { --panel-border: var(--amber); --panel-bg: rgba(255, 180, 84, 0.06); --panel-glow: var(--amber-glow); }
.hud-panel--no-trade { --panel-border: rgba(207, 233, 255, 0.35); --panel-bg: rgba(207, 233, 255, 0.03); --panel-glow: rgba(207, 233, 255, 0.08); }
.hud-panel--unclear { --panel-border: var(--dim); --panel-bg: rgba(111, 147, 179, 0.05); --panel-glow: rgba(111, 147, 179, 0.1); }
.hud-panel--invalid { --panel-border: var(--red); --panel-bg: rgba(255, 68, 102, 0.06); --panel-glow: var(--red-glow); }
.hud-panel--reached { --panel-border: var(--green); --panel-bg: rgba(57, 255, 158, 0.09); --panel-glow: var(--green-glow); }

/* ---- Expander (game plan) ---- */
[data-testid="stExpander"] {
    border: 1px solid rgba(0, 229, 255, 0.18) !important;
    border-radius: 4px !important;
    background: rgba(0, 229, 255, 0.02);
}
[data-testid="stExpander"] summary {
    font-family: 'Share Tech Mono', monospace;
    letter-spacing: 0.05em;
    color: var(--cyan) !important;
}
"""
