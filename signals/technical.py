import numpy as np


def vwap(df):
    typical = (df["high"] + df["low"] + df["close"]) / 3
    cum_vol = df["volume"].cumsum()
    cum_vol_price = (typical * df["volume"]).cumsum()
    volume_weighted = cum_vol_price / cum_vol
    # Indices report zero trade volume, making this 0/0 (NaN) for every bar.
    # Fall back to a plain running average of price so VWAP stays meaningful
    # instead of silently breaking the price-vs-VWAP comparison downstream.
    return volume_weighted.where(cum_vol > 0, typical.expanding().mean())


def moving_average(series, window):
    return series.rolling(window).mean()


def rsi(series, period):
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def key_levels(df, lookback=100):
    recent = df.tail(lookback)
    return {"recent_high": recent["high"].max(), "recent_low": recent["low"].min()}


def compute_indicators(df, ma_fast, ma_slow, rsi_period):
    close = df["close"]
    out = {
        "price": close.iloc[-1],
        "vwap": vwap(df).iloc[-1],
        "ma_fast": moving_average(close, ma_fast).iloc[-1],
        "ma_slow": moving_average(close, ma_slow).iloc[-1],
        "rsi": rsi(close, rsi_period).iloc[-1],
    }
    out.update(key_levels(df))
    return out
