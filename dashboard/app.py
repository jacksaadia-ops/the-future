import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
import streamlit as st

from config import DATA_MODE, MA_FAST, MA_SLOW, REFRESH_INTERVAL_SECONDS, RSI_PERIOD, SYMBOLS
from signals.aggregator import aggregate_signal
from signals.internals import compute_internals_signal
from signals.options_flow import compute_options_signal
from signals.tape_reading import compute_tape_signal
from signals.technical import compute_indicators
from storage.db import init_db, log_signal

st.set_page_config(page_title="Trading Signals", layout="wide")
init_db()

if "feed" not in st.session_state:
    if DATA_MODE == "ibkr":
        from data.ibkr_bars import IBKRBarFeed
        from data.ibkr_connection import connect, qualify_all
        from data.ibkr_internals import IBKRInternalsFeed
        from data.ibkr_options import IBKROptionsFeed
        from data.ibkr_tape import IBKRTapeFeed

        try:
            ib = connect()
        except TimeoutError:
            st.error(
                "Couldn't connect to IB Gateway — most likely another browser tab or "
                "terminal window from an earlier run is still open and holding the "
                "connection.\n\n"
                "**This dashboard already auto-refreshes itself every "
                f"{REFRESH_INTERVAL_SECONDS} seconds — you never need to manually "
                "reload this page.**\n\n"
                "To fix: close this tab, check Task Manager for any leftover "
                "`python.exe` processes and end them, then restart with "
                "`streamlit run dashboard/app.py` in a single fresh terminal."
            )
            st.stop()
        contracts = qualify_all(ib)
        st.session_state.ib = ib
        st.session_state.feed = IBKRBarFeed(ib, contracts)
        st.session_state.tape_feed = IBKRTapeFeed(ib, contracts)
        st.session_state.options_feed = IBKROptionsFeed(ib, contracts, st.session_state.feed)
        st.session_state.internals_feed = IBKRInternalsFeed(ib)
    else:
        from data.mock_feed import MockFeed
        from data.mock_internals import MockInternalsFeed
        from data.mock_options import MockOptionsFeed
        from data.mock_tape import MockTapeFeed

        st.session_state.feed = MockFeed()
        st.session_state.tape_feed = MockTapeFeed()
        st.session_state.options_feed = MockOptionsFeed()
        st.session_state.internals_feed = MockInternalsFeed()

feed = st.session_state.feed
tape_feed = st.session_state.tape_feed
options_feed = st.session_state.options_feed
internals_feed = st.session_state.internals_feed
feed.update()
tape_feed.update()
options_feed.update()
internals_feed.update()

internals = compute_internals_signal(internals_feed.get_internals())

st.title("Trading Signals Dashboard")
if DATA_MODE == "ibkr":
    st.caption(
        "Connected to IBKR — live account data. "
        f"Auto-refreshes every {REFRESH_INTERVAL_SECONDS}s — do not manually reload this page."
    )
else:
    st.caption("Running on simulated (mock) data — not connected to a live broker yet.")

vix_arrow = "▲" if internals["vix_change"] > 0 else "▼"
st.info(
    f"**Market internals** — TICK: {internals['tick']:+d}  |  "
    f"ADD: {internals['add']:+d}  |  "
    f"VIX: {internals['vix']:.2f} ({vix_arrow}{abs(internals['vix_change']):.2f})"
)

SIGNAL_COLOR = {"BUY": "#1a9c46", "SELL": "#d23c3c", "WATCH": "#d9a121"}

cols = st.columns(len(SYMBOLS))

for col, sym in zip(cols, SYMBOLS):
    df = feed.get_bars(sym.ticker)
    indicators = compute_indicators(df, MA_FAST, MA_SLOW, RSI_PERIOD)
    prints = tape_feed.get_prints(sym.ticker)
    tape = compute_tape_signal(prints)
    options_data = options_feed.get_options_data(sym.ticker)
    options = compute_options_signal(options_data)
    result = aggregate_signal(indicators, tape, options, internals)
    log_signal(sym.ticker, result)

    with col:
        color = SIGNAL_COLOR[result["signal"]]
        st.markdown(f"#### {sym.ticker}")
        st.markdown(
            f"<span style='color:{color}; font-size:1.4em; font-weight:bold'>{result['signal']}</span>",
            unsafe_allow_html=True,
        )
        price_decimals = 0 if result["price"] >= 1000 else 2
        st.metric("Price", f"{result['price']:,.{price_decimals}f}")
        st.caption(f"VWAP {result['vwap']:.2f}  |  MA{MA_FAST}/{MA_SLOW} {result['ma_fast']:.2f}/{result['ma_slow']:.2f}")
        rsi_text = f"{result['rsi']:.1f}" if not pd.isna(result["rsi"]) else "n/a"
        st.caption(f"RSI {rsi_text}")
        st.caption(
            f"Tape: {tape['imbalance_ratio']:.0%} buy / {1 - tape['imbalance_ratio']:.0%} sell "
            f"(Δ{tape['volume_delta']:+,})"
        )
        st.caption(f"Large prints: {tape['large_buy_count']} buy / {tape['large_sell_count']} sell")
        if options["call_volume"] == 0 and options["put_volume"] == 0:
            st.caption("Options: n/a")
        else:
            st.caption(
                f"Options: P/C {options['put_call_ratio']:.2f}  |  "
                f"calls {options['call_volume']:,} / puts {options['put_volume']:,}"
                + (" ⚠️unusual" if options["unusual_call_volume"] or options["unusual_put_volume"] else "")
            )
        st.caption(", ".join(result["reasons"]))
        st.line_chart(df["close"].tail(60), height=150)

time.sleep(REFRESH_INTERVAL_SECONDS)
st.rerun()
