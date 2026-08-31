import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import streamlit as st

from futures import config
from futures.formatting import render_alert_html
from futures.game_plan import build_game_plan
from futures.key_levels import compute_key_levels
from futures.market_structure import analyze_market_structure
from futures.order_flow import compute_depth_signal, compute_tape_signal
from futures.risk import check_risk_limits
from futures.setup_engine import evaluate_setup
from futures.style import CUSTOM_CSS
from futures.tracker import AlertTracker

st.set_page_config(page_title="Futures Trading Assistant", layout="wide", page_icon="🛰️")
st.markdown(f"<style>{CUSTOM_CSS}</style>", unsafe_allow_html=True)
st.title("AI Futures Trading Decision-Support")
st.caption(
    "Analysis only — this tool never places, modifies, or cancels orders. "
    "Every trade shown here must be reviewed and executed manually by you."
)

if "tracker" not in st.session_state:
    st.session_state.tracker = AlertTracker()

if "feed" not in st.session_state:
    if config.DATA_MODE == "projectx":
        from futures.bars import ProjectXBarFeed
        from futures.client import ProjectXClient, ProjectXError
        from futures.realtime import ProjectXRealtimeFeed, ProjectXUserFeed

        if not (config.PROJECTX_USERNAME and config.PROJECTX_API_KEY):
            st.error(
                "PROJECTX_USERNAME / PROJECTX_API_KEY are not set. Set them as environment "
                "variables (generate a key in TopstepX under Settings -> API) before running "
                "in live mode, or set FUTURES_DATA_MODE=mock to run on simulated data."
            )
            st.stop()
        try:
            client = ProjectXClient()
            contracts = {}
            for ticker in config.CONTRACTS:
                results = client.search_contracts(config.CONTRACT_SEARCH_TEXT[ticker], live=False)
                if not results:
                    raise ProjectXError(f"No contract found for search text {config.CONTRACT_SEARCH_TEXT[ticker]!r}")
                print(f"[ProjectX] {ticker} contract candidates: {results}")
                contracts[ticker] = results[0]["id"]
                print(f"[ProjectX] {ticker} resolved to contract id: {contracts[ticker]}")
        except Exception as e:
            st.error(f"LIVE DATA UNAVAILABLE — I CANNOT VALIDATE A TRADE\n\nCouldn't connect to TopstepX: {e}")
            st.stop()

        st.session_state.client = client
        st.session_state.feed = ProjectXBarFeed(client, contracts)
        st.session_state.realtime = ProjectXRealtimeFeed(client, contracts)
        st.session_state.realtime.connect()
        if config.PROJECTX_ACCOUNT_ID:
            st.session_state.user_feed = ProjectXUserFeed(client, config.PROJECTX_ACCOUNT_ID)
            st.session_state.user_feed.connect()
        else:
            st.session_state.user_feed = None
    else:
        from futures.mock_feed import MockFuturesFeed

        st.session_state.feed = MockFuturesFeed()
        st.session_state.realtime = None
        st.session_state.user_feed = None

feed = st.session_state.feed
realtime = st.session_state.get("realtime")
user_feed = st.session_state.get("user_feed")
tracker = st.session_state.tracker

try:
    feed.update()

    if config.DATA_MODE == "mock":
        st.markdown(
            '<div class="hud-status"><span class="hud-dot mock"></span>'
            "SIMULATED FEED — not connected to a live Topstep/ProjectX account</div>",
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            '<div class="hud-status"><span class="hud-dot"></span>'
            "LIVE — connected to TopstepX (ProjectX Gateway)</div>",
            unsafe_allow_html=True,
        )

    account = user_feed.snapshot() if user_feed else {"daily_pnl": None, "open_position_size": 0}
    if config.DATA_MODE == "projectx" and not config.PROJECTX_ACCOUNT_ID:
        st.warning(
            "PROJECTX_ACCOUNT_ID is not set — risk-rule checks (max daily loss / max position "
            "size) are disabled until it is."
        )

    cols = st.columns(len(config.CONTRACTS))
    for col, ticker in zip(cols, config.CONTRACTS):
        df = feed.get_bars(ticker)
        if config.DATA_MODE == "projectx":
            stale = feed.seconds_since_update(ticker)
            trades = realtime.get_trades(ticker)
            depth = realtime.get_depth(ticker)
        else:
            stale = feed.seconds_since_update(ticker)
            trades = feed.get_trades(ticker)
            depth = feed.get_depth(ticker)

        with col:
            st.markdown(f"#### {ticker}")
            if df.empty:
                st.warning("LIVE DATA UNAVAILABLE — I CANNOT VALIDATE A TRADE")
                continue
            if stale is not None and stale > config.DATA_STALE_SECONDS:
                st.warning(f"Data is {stale:.0f}s stale — treating as unreliable.")

            price = feed.latest_price(ticker)
            key_levels = compute_key_levels(df)
            structure = analyze_market_structure(df)
            tape = compute_tape_signal(trades)
            depth_signal = compute_depth_signal(depth)
            risk_warnings = check_risk_limits(account)

            invalidation = tracker.check(ticker, price)
            if invalidation:
                st.markdown(render_alert_html(invalidation), unsafe_allow_html=True)

            result = evaluate_setup(ticker, price, structure, key_levels, tape, depth_signal, risk_warnings)
            tracker.record(ticker, result)

            st.metric("Price", f"{price:,.2f}")
            vwap_text = f"{key_levels['vwap']:.2f}" if key_levels["vwap"] == key_levels["vwap"] else "n/a"
            st.caption(f"VWAP {vwap_text}  |  Session {key_levels['session_low']:.2f}-{key_levels['session_high']:.2f}")
            st.markdown(render_alert_html(result), unsafe_allow_html=True)

            with st.expander("Pre-market game plan"):
                st.text(build_game_plan(ticker, key_levels, structure))

except (ConnectionError, OSError) as e:
    st.warning(f"Lost connection ({e}) — reconnecting automatically...")
    for key in ("client", "feed", "realtime", "user_feed"):
        st.session_state.pop(key, None)

time.sleep(config.REFRESH_INTERVAL_SECONDS)
st.rerun()
