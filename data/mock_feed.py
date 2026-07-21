import numpy as np
import pandas as pd

from config import BASE_PRICE, SYMBOLS, VOLATILITY

_HISTORY_BARS = 200
_MAX_BARS = 500


class MockFeed:
    """Simulated OHLCV bar feed, standing in for a real broker connection during development."""

    def __init__(self, seed=None):
        self._rng = np.random.default_rng(seed)
        self._bars = {s.ticker: self._seed_history(s.ticker) for s in SYMBOLS}

    def _seed_history(self, ticker, n=_HISTORY_BARS):
        price = BASE_PRICE[ticker]
        vol = VOLATILITY[ticker]
        closes = [price]
        for _ in range(n - 1):
            price = price * (1 + self._rng.normal(0, vol))
            closes.append(price)
        closes = np.array(closes)
        opens = np.roll(closes, 1)
        opens[0] = closes[0]
        highs = np.maximum(opens, closes) * (1 + self._rng.uniform(0, vol, n))
        lows = np.minimum(opens, closes) * (1 - self._rng.uniform(0, vol, n))
        volumes = self._rng.integers(500, 5000, n)
        idx = pd.date_range(end=pd.Timestamp.now().floor("min"), periods=n, freq="min")
        return pd.DataFrame(
            {"open": opens, "high": highs, "low": lows, "close": closes, "volume": volumes},
            index=idx,
        )

    def update(self):
        """Advance every symbol by one simulated bar."""
        for ticker, df in self._bars.items():
            vol = VOLATILITY[ticker]
            last_close = df["close"].iloc[-1]
            new_open = last_close
            new_close = last_close * (1 + self._rng.normal(0, vol))
            new_high = max(new_open, new_close) * (1 + self._rng.uniform(0, vol))
            new_low = min(new_open, new_close) * (1 - self._rng.uniform(0, vol))
            new_volume = int(self._rng.integers(500, 5000))
            new_row = pd.DataFrame(
                {
                    "open": [new_open],
                    "high": [new_high],
                    "low": [new_low],
                    "close": [new_close],
                    "volume": [new_volume],
                },
                index=[pd.Timestamp.now()],
            )
            self._bars[ticker] = pd.concat([df, new_row]).iloc[-_MAX_BARS:]

    def get_bars(self, ticker):
        return self._bars[ticker].copy()

    def latest_price(self, ticker):
        return self._bars[ticker]["close"].iloc[-1]
