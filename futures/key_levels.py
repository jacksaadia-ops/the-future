import pandas as pd

from futures import config


def _as_utc(ts):
    return ts.tz_localize("UTC") if ts.tzinfo is None else ts


def _session_start(now):
    start = now.replace(
        hour=config.SESSION_OPEN_HOUR_UTC, minute=config.SESSION_OPEN_MINUTE_UTC, second=0, microsecond=0
    )
    if now < start:
        start -= pd.Timedelta(days=1)
    return start


def session_vwap(df):
    if df.empty:
        return float("nan")
    now = _as_utc(df.index[-1])
    session = df[df.index >= _session_start(now)]
    if session.empty:
        session = df
    typical = (session["high"] + session["low"] + session["close"]) / 3
    cum_vol = session["volume"].cumsum()
    cum_vol_price = (typical * session["volume"]).cumsum()
    vwap = cum_vol_price / cum_vol
    return vwap.iloc[-1] if len(vwap) else float("nan")


def session_high_low(df):
    if df.empty:
        return float("nan"), float("nan")
    now = _as_utc(df.index[-1])
    session = df[df.index >= _session_start(now)]
    if session.empty:
        return float("nan"), float("nan")
    return session["high"].max(), session["low"].min()


def overnight_high_low(df):
    """Bars between the previous session's close and today's session open."""
    if df.empty:
        return float("nan"), float("nan")
    now = _as_utc(df.index[-1])
    today_start = _session_start(now)
    overnight = df[df.index < today_start]
    if overnight.empty:
        return float("nan"), float("nan")
    # Restrict to roughly the prior 23h so a long-running history doesn't
    # pull in multiple sessions' worth of overnight range.
    overnight = overnight[overnight.index >= today_start - pd.Timedelta(hours=23)]
    if overnight.empty:
        return float("nan"), float("nan")
    return overnight["high"].max(), overnight["low"].min()


def previous_session_high_low(df):
    if df.empty:
        return float("nan"), float("nan")
    now = _as_utc(df.index[-1])
    today_start = _session_start(now)
    prev_start = today_start - pd.Timedelta(days=1)
    prev_session = df[(df.index >= prev_start) & (df.index < today_start)]
    if prev_session.empty:
        return float("nan"), float("nan")
    return prev_session["high"].max(), prev_session["low"].min()


def opening_range(df):
    if df.empty:
        return float("nan"), float("nan")
    now = _as_utc(df.index[-1])
    start = _session_start(now)
    end = start + pd.Timedelta(minutes=config.OPENING_RANGE_MINUTES)
    orb = df[(df.index >= start) & (df.index < end)]
    if orb.empty:
        return float("nan"), float("nan")
    return orb["high"].max(), orb["low"].min()


def compute_key_levels(df):
    vwap = session_vwap(df)
    session_high, session_low = session_high_low(df)
    on_high, on_low = overnight_high_low(df)
    prev_high, prev_low = previous_session_high_low(df)
    or_high, or_low = opening_range(df)
    return {
        "vwap": vwap,
        "session_high": session_high,
        "session_low": session_low,
        "overnight_high": on_high,
        "overnight_low": on_low,
        "prev_session_high": prev_high,
        "prev_session_low": prev_low,
        "opening_range_high": or_high,
        "opening_range_low": or_low,
    }
