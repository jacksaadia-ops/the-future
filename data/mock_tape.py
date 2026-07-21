from collections import deque

import numpy as np
import pandas as pd

from config import BASE_PRICE, SYMBOLS, TICK_SIZE, VOLATILITY

_PRINTS_PER_UPDATE_MEAN = 15
_LARGE_PRINT_PROB = 0.05
_MAX_PRINTS = 1000


class MockTapeFeed:
    """Simulated time & sales feed: individual trade prints with an aggressor side and size.

    Stands in for real Level 1/2 tick data until a live IBKR connection is wired up.
    """

    def __init__(self, seed=None):
        self._rng = np.random.default_rng(seed)
        self._prices = {s.ticker: BASE_PRICE[s.ticker] for s in SYMBOLS}
        # Slowly mean-reverting bias per symbol, so buy/sell pressure forms streaks
        # instead of pure 50/50 noise every print.
        self._bias = {s.ticker: 0.0 for s in SYMBOLS}
        self._prints = {s.ticker: deque(maxlen=_MAX_PRINTS) for s in SYMBOLS}

    def update(self):
        for symbol in SYMBOLS:
            ticker = symbol.ticker
            vol = VOLATILITY[ticker]
            tick = TICK_SIZE[ticker]

            self._bias[ticker] = np.clip(
                self._bias[ticker] * 0.9 + self._rng.normal(0, 0.15), -0.9, 0.9
            )
            buy_prob = 0.5 + self._bias[ticker] * 0.4

            n_prints = int(self._rng.poisson(_PRINTS_PER_UPDATE_MEAN))
            for _ in range(n_prints):
                is_buy = self._rng.random() < buy_prob
                is_large = self._rng.random() < _LARGE_PRINT_PROB
                size = (
                    int(self._rng.integers(100, 1000))
                    if is_large
                    else int(self._rng.integers(1, 50))
                )
                price_move = tick * self._rng.integers(0, 3) * (1 if is_buy else -1)
                self._prices[ticker] = max(0.01, self._prices[ticker] + price_move)

                self._prints[ticker].append(
                    {
                        "ts": pd.Timestamp.now(),
                        "price": self._prices[ticker],
                        "size": size,
                        "side": "buy" if is_buy else "sell",
                        "large": is_large,
                    }
                )

    def get_prints(self, ticker, n=200):
        return list(self._prints[ticker])[-n:]

    def latest_price(self, ticker):
        return self._prices[ticker]
