from collections import deque

import numpy as np

_HISTORY_LEN = 30
_BASE_VIX = 16.0
_MIN_VIX = 9.0


class MockInternalsFeed:
    """Simulated market-wide breadth internals: NYSE TICK, ADD, and VIX.

    Unlike the other mock feeds these are shared across all symbols, not
    per-ticker, since they describe overall market participation rather than
    one instrument.
    """

    def __init__(self, seed=None):
        self._rng = np.random.default_rng(seed)
        self._breadth_bias = 0.0
        self._vix = _BASE_VIX
        self._tick_history = deque(maxlen=_HISTORY_LEN)
        self._add_history = deque(maxlen=_HISTORY_LEN)
        self._vix_history = deque(maxlen=_HISTORY_LEN)

    def update(self):
        self._breadth_bias = np.clip(
            self._breadth_bias * 0.9 + self._rng.normal(0, 0.12), -1, 1
        )

        tick = int(np.clip(self._breadth_bias * 700 + self._rng.normal(0, 250), -1500, 1500))
        add = int(np.clip(self._breadth_bias * 1200 + self._rng.normal(0, 400), -3000, 3000))

        # VIX tends to drift up when breadth turns negative (risk-off) and down otherwise.
        vix_drift = -self._breadth_bias * 0.15 + self._rng.normal(0, 0.12)
        self._vix = max(_MIN_VIX, self._vix + vix_drift)

        self._tick_history.append(tick)
        self._add_history.append(add)
        self._vix_history.append(self._vix)

    def get_internals(self):
        return {
            "tick": self._tick_history[-1],
            "add": self._add_history[-1],
            "vix": self._vix_history[-1],
            "vix_history": list(self._vix_history),
        }
