import os

# Most liquid, cleanest-tape CME index futures — the natural fit for a
# Topstep evaluation/funded account given the "best liquidity, cleanest
# price action" selection criteria in the trading spec. Add more contracts
# here (and to CONTRACT_SEARCH_TEXT / TICK_SIZE / TICK_VALUE below) to widen
# the watchlist.
CONTRACTS = ["ES", "NQ"]

# Text passed to ProjectX's Contract/search to resolve the front-month
# continuous contract for each ticker.
CONTRACT_SEARCH_TEXT = {
    "ES": "ES",
    "NQ": "NQ",
}

TICK_SIZE = {"ES": 0.25, "NQ": 0.25}
TICK_VALUE = {"ES": 12.50, "NQ": 5.00}  # $ per tick, front-month E-mini

# "mock" runs entirely on simulated data for local development with no
# credentials. "projectx" connects live to your TopstepX (ProjectX Gateway)
# account — requires PROJECTX_USERNAME / PROJECTX_API_KEY / PROJECTX_ACCOUNT_ID.
DATA_MODE = os.environ.get("FUTURES_DATA_MODE", "mock")

PROJECTX_API_BASE = "https://api.topstepx.com/api"
PROJECTX_USER_HUB_URL = "https://rtc.topstepx.com/hubs/user"
PROJECTX_MARKET_HUB_URL = "https://rtc.topstepx.com/hubs/market"

# Set these as environment variables — never hardcode credentials here.
# Generate an API key in TopstepX under Settings -> API (requires a
# ProjectX API subscription; see https://help.topstep.com/en/articles/11187768).
PROJECTX_USERNAME = os.environ.get("PROJECTX_USERNAME", "")
PROJECTX_API_KEY = os.environ.get("PROJECTX_API_KEY", "")
PROJECTX_ACCOUNT_ID = os.environ.get("PROJECTX_ACCOUNT_ID", "")

# Set these to match your actual Topstep account size / evaluation rules —
# the dashboard warns before surfacing a new setup if taking it could put
# you at risk of violating either one.
MAX_DAILY_LOSS = float(os.environ.get("FUTURES_MAX_DAILY_LOSS", "1000"))
MAX_POSITION_SIZE = int(os.environ.get("FUTURES_MAX_POSITION_SIZE", "3"))

# Manually maintained — no economic-calendar integration is wired up (never
# invent this data). Add today's known high-impact events as
# ("HH:MM", "label") tuples, in UTC, before the session if you want them
# reflected in the pre-market game plan.
ECONOMIC_EVENTS_TODAY = []

OPENING_RANGE_MINUTES = 15
SWING_LOOKBACK = 3  # bars on each side required to confirm a swing high/low
# ~9:30am ET regular session open. Fixed UTC offset (13:30 = 9:30 ET
# standard time) — shift by an hour yourself around US DST transitions.
SESSION_OPEN_HOUR_UTC = 13
SESSION_OPEN_MINUTE_UTC = 30
DATA_STALE_SECONDS = 10
REFRESH_INTERVAL_SECONDS = 2
HISTORY_LOOKBACK_HOURS = 24
BAR_UNIT_MINUTE = 2  # ProjectX BarUnitEnum: 1=Second, 2=Minute, 3=Hour, 4=Day, 5=Week, 6=Month
