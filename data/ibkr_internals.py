import math
from collections import deque

from ib_async import Index

_HISTORY_LEN = 30


def _finite(value):
    """None-safe, NaN-safe numeric check. ib_async tickers default unset
    fields to float('nan'), not None — and NaN is truthy in Python, so a
    plain `value or default` silently lets NaN through and later crashes
    on int(nan). Returns value if it's a real number, else None.
    """
    if value is None:
        return None
    try:
        return None if math.isnan(value) else value
    except TypeError:
        return value


class IBKRInternalsFeed:
    """Live NYSE TICK, ADD, and VIX via IBKR index market data.

    Confirmed against a live account: TICK-NYSE and VIX resolve fine, but
    ADD-NYSE comes back "No security definition has been found" — it's
    either the wrong symbol for this account/region or unavailable outright.
    Each contract is qualified individually and skipped (rather than
    crashing the feed) if it doesn't resolve; unresolved ones just report 0.
    """

    def __init__(self, ib):
        self._ib = ib
        self._tick_ticker = self._try_subscribe(ib, Index("TICK-NYSE", "NYSE", "USD"))
        self._add_ticker = self._try_subscribe(ib, Index("ADD-NYSE", "NYSE", "USD"))
        self._vix_ticker = self._try_subscribe(ib, Index("VIX", "CBOE", "USD"))
        self._vix_history = deque(maxlen=_HISTORY_LEN)

    @staticmethod
    def _try_subscribe(ib, contract):
        ib.qualifyContracts(contract)
        if not contract.conId:
            return None
        return ib.reqMktData(contract, "", False, False)

    def update(self):
        self._ib.sleep(0.15)
        if self._vix_ticker is not None:
            vix = _finite(self._vix_ticker.last) or _finite(self._vix_ticker.close)
            if vix is not None:
                self._vix_history.append(vix)

    def get_internals(self):
        tick = _finite(self._tick_ticker.last) if self._tick_ticker is not None else None
        add = _finite(self._add_ticker.last) if self._add_ticker is not None else None
        vix = self._vix_history[-1] if self._vix_history else None
        return {
            "tick": int(tick) if tick is not None else 0,
            "add": int(add) if add is not None else 0,
            "vix": float(vix) if vix is not None else 0.0,
            "vix_history": list(self._vix_history),
        }
