from collections import deque

import numpy as np

from config import OPTIONS_BASE_OI, OPTIONS_BASE_VOLUME, SYMBOLS

_HISTORY_LEN = 30
_SPIKE_PROB = 0.06


class MockOptionsFeed:
    """Simulated options-chain flow: aggregate call/put volume and open interest per symbol.

    Stands in for a real options data vendor until a live IBKR connection is wired up.
    """

    def __init__(self, seed=None):
        self._rng = np.random.default_rng(seed)
        self._bias = {s.ticker: 0.0 for s in SYMBOLS}
        self._call_oi = {s.ticker: OPTIONS_BASE_OI[s.ticker] for s in SYMBOLS}
        self._put_oi = {s.ticker: OPTIONS_BASE_OI[s.ticker] for s in SYMBOLS}
        self._call_vol_history = {s.ticker: deque(maxlen=_HISTORY_LEN) for s in SYMBOLS}
        self._put_vol_history = {s.ticker: deque(maxlen=_HISTORY_LEN) for s in SYMBOLS}

    def update(self):
        for symbol in SYMBOLS:
            ticker = symbol.ticker
            base = OPTIONS_BASE_VOLUME[ticker]
            if base == 0:
                self._call_vol_history[ticker].append(0)
                self._put_vol_history[ticker].append(0)
                continue

            self._bias[ticker] = np.clip(
                self._bias[ticker] * 0.9 + self._rng.normal(0, 0.15), -0.9, 0.9
            )
            bias = self._bias[ticker]

            is_spike = self._rng.random() < _SPIKE_PROB
            spike_side_call = self._rng.random() < 0.5

            call_volume = int(base * (1 + bias * 0.5) * self._rng.uniform(0.7, 1.3))
            put_volume = int(base * (1 - bias * 0.5) * self._rng.uniform(0.7, 1.3))
            if is_spike:
                spike_mult = self._rng.uniform(3, 7)
                if spike_side_call:
                    call_volume = int(call_volume * spike_mult)
                else:
                    put_volume = int(put_volume * spike_mult)

            self._call_vol_history[ticker].append(call_volume)
            self._put_vol_history[ticker].append(put_volume)

            self._call_oi[ticker] = max(
                0, self._call_oi[ticker] + int(call_volume * self._rng.uniform(-0.2, 0.4))
            )
            self._put_oi[ticker] = max(
                0, self._put_oi[ticker] + int(put_volume * self._rng.uniform(-0.2, 0.4))
            )

    def get_options_data(self, ticker):
        call_history = self._call_vol_history[ticker]
        put_history = self._put_vol_history[ticker]
        return {
            "call_volume": call_history[-1] if call_history else 0,
            "put_volume": put_history[-1] if put_history else 0,
            "call_oi": self._call_oi[ticker],
            "put_oi": self._put_oi[ticker],
            "call_volume_history": list(call_history),
            "put_volume_history": list(put_history),
        }
