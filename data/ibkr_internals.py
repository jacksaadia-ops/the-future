from collections import deque

from ib_async import Index

_HISTORY_LEN = 30


class IBKRInternalsFeed:
    """Live NYSE TICK, ADD, and VIX via IBKR index market data.

    NOTE: unverified against a live connection. TICK-NYSE and ADD-NYSE are
    the documented IBKR symbols for these breadth internals, but whether
    your account's data subscriptions actually include them needs
    confirming once connected — if not, this will need a different symbol
    or data source.
    """

    def __init__(self, ib):
        self._ib = ib
        self._tick_contract = Index("TICK-NYSE", "NYSE", "USD")
        self._add_contract = Index("ADD-NYSE", "NYSE", "USD")
        self._vix_contract = Index("VIX", "CBOE", "USD")
        for contract in (self._tick_contract, self._add_contract, self._vix_contract):
            ib.qualifyContracts(contract)

        self._tick_ticker = ib.reqMktData(self._tick_contract, "", False, False)
        self._add_ticker = ib.reqMktData(self._add_contract, "", False, False)
        self._vix_ticker = ib.reqMktData(self._vix_contract, "", False, False)
        self._vix_history = deque(maxlen=_HISTORY_LEN)

    def update(self):
        self._ib.sleep(0)
        vix = self._vix_ticker.last or self._vix_ticker.close
        if vix:
            self._vix_history.append(vix)

    def get_internals(self):
        tick = self._tick_ticker.last or 0
        add = self._add_ticker.last or 0
        vix = self._vix_history[-1] if self._vix_history else (self._vix_ticker.last or 0)
        return {
            "tick": int(tick),
            "add": int(add),
            "vix": float(vix) if vix else 0.0,
            "vix_history": list(self._vix_history),
        }
