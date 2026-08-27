from collections import deque

import numpy as np
import pandas as pd

from futures import config

_HISTORY_BARS = 300
_MAX_BARS = 1000
_BASE_PRICE = {"ES": 5605.0, "NQ": 19720.0}
_VOLATILITY = {"ES": 0.0006, "NQ": 0.0007}


class MockFuturesFeed:
    """Simulated bars, time & sales, and DOM for local development without
    live Topstep/ProjectX credentials. Standalone from the other dashboard's
    mock feeds so this tool has no dependency on that one.
    """

    def __init__(self, seed=None):
        self._rng = np.random.default_rng(seed)
        self._bars = {t: self._seed_history(t) for t in config.CONTRACTS}
        self._trades = {t: deque(maxlen=2000) for t in config.CONTRACTS}
        self._bias = {t: 0.0 for t in config.CONTRACTS}

    def _seed_history(self, ticker, n=_HISTORY_BARS):
        price = _BASE_PRICE[ticker]
        vol = _VOLATILITY[ticker]
        closes = [price]
        for _ in range(n - 1):
            price = price * (1 + self._rng.normal(0, vol))
            closes.append(price)
        closes = np.array(closes)
        opens = np.roll(closes, 1)
        opens[0] = closes[0]
        highs = np.maximum(opens, closes) * (1 + self._rng.uniform(0, vol, n))
        lows = np.minimum(opens, closes) * (1 - self._rng.uniform(0, vol, n))
        volumes = self._rng.integers(200, 3000, n)
        idx = pd.date_range(end=pd.Timestamp.now(tz="UTC").floor("min"), periods=n, freq="min")
        return pd.DataFrame(
            {"open": opens, "high": highs, "low": lows, "close": closes, "volume": volumes}, index=idx
        )

    def update(self):
        for ticker in config.CONTRACTS:
            df = self._bars[ticker]
            vol = _VOLATILITY[ticker]
            tick = config.TICK_SIZE[ticker]
            last_close = df["close"].iloc[-1]

            self._bias[ticker] = np.clip(self._bias[ticker] * 0.9 + self._rng.normal(0, 0.15), -0.9, 0.9)
            buy_prob = 0.5 + self._bias[ticker] * 0.4

            new_open = last_close
            new_close = last_close * (1 + self._rng.normal(0, vol))
            new_high = max(new_open, new_close) * (1 + self._rng.uniform(0, vol))
            new_low = min(new_open, new_close) * (1 - self._rng.uniform(0, vol))
            new_volume = int(self._rng.integers(200, 3000))
            new_row = pd.DataFrame(
                {
                    "open": [new_open],
                    "high": [new_high],
                    "low": [new_low],
                    "close": [new_close],
                    "volume": [new_volume],
                },
                index=[pd.Timestamp.now(tz="UTC")],
            )
            self._bars[ticker] = pd.concat([df, new_row]).iloc[-_MAX_BARS:]

            price = new_close
            n_prints = int(self._rng.poisson(20))
            for _ in range(n_prints):
                is_buy = self._rng.random() < buy_prob
                is_large = self._rng.random() < 0.05
                size = int(self._rng.integers(10, 80)) if is_large else int(self._rng.integers(1, 10))
                price += tick * self._rng.integers(0, 2) * (1 if is_buy else -1)
                self._trades[ticker].append(
                    {
                        "ts": pd.Timestamp.now(tz="UTC"),
                        "price": price,
                        "size": size,
                        "side": "buy" if is_buy else "sell",
                    }
                )

    def get_bars(self, ticker):
        return self._bars[ticker].copy()

    def latest_price(self, ticker):
        return self._bars[ticker]["close"].iloc[-1]

    def get_trades(self, ticker, n=200):
        return list(self._trades[ticker])[-n:]

    def get_depth(self, ticker, levels=10):
        price = self.latest_price(ticker)
        tick = config.TICK_SIZE[ticker]
        bids = [(round(price - tick * i, 2), int(self._rng.integers(5, 120))) for i in range(1, levels + 1)]
        asks = [(round(price + tick * i, 2), int(self._rng.integers(5, 120))) for i in range(1, levels + 1)]
        return {"bids": bids, "asks": asks}

    def seconds_since_update(self, ticker):
        return 0
