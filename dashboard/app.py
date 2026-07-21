import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
import streamlit as st

from config import MA_FAST, MA_SLOW, REFRESH_INTERVAL_SECONDS, RSI_PERIOD, SYMBOLS
from data.mock_feed import MockFeed
from data.mock_tape import MockTapeFeed
from signals.aggregator import aggregate_signal
from signals.tape_reading import compute_tape_signal
from signals.technical import compute_indicators
from storage.db import init_db, log_signal

st.set_page_config(page_title="Trading Signals", layout="wide")
init_db()

if "feed" not in st.session_state:
    st.session_state.feed = MockFeed()
if "tape_feed" not in st.session_state:
    st.session_state.tape_feed = MockTapeFeed()

feed = st.session_state.feed
tape_feed = st.session_state.tape_feed
feed.update()
tape_feed.update()

st.title("Trading Signals Dashboard")
st.caption("Running on simulated (mock) data — not connected to a live broker yet.")

SIGNAL_COLOR = {"BUY": "#1a9c46", "SELL": "#d23c3c", "WATCH": "#d9a121"}

cols = st.columns(len(SYMBOLS))

for col, sym in zip(cols, SYMBOLS):
    df = feed.get_bars(sym.ticker)
    indicators = compute_indicators(df, MA_FAST, MA_SLOW, RSI_PERIOD)
    prints = tape_feed.get_prints(sym.ticker)
    tape = compute_tape_signal(prints)
    result = aggregate_signal(indicators, tape)
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
        st.caption(", ".join(result["reasons"]))
        st.line_chart(df["close"].tail(60), height=150)

time.sleep(REFRESH_INTERVAL_SECONDS)
st.rerun()
