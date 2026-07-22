import math
from collections import deque

from ib_async import Option

from config import OPTIONS_BASE_VOLUME, SYMBOLS


def _finite_or_zero(value):
    """ib_async tickers default unset numeric fields to float('nan'), not
    None or 0 — and NaN is truthy in Python, so `value or 0` doesn't catch
    it. Used here so an unpopulated volume/OI tick reads as 0, not NaN.
    """
    if value is None:
        return 0
    try:
        return 0 if math.isnan(value) else value
    except TypeError:
        return value

_HISTORY_LEN = 30
_STRIKES_EACH_SIDE = 5
_EMPTY_DATA = {
    "call_volume": 0,
    "put_volume": 0,
    "call_oi": 0,
    "put_oi": 0,
    "call_volume_history": [0],
    "put_volume_history": [0],
}


class IBKROptionsFeed:
    """Aggregate call/put volume & open interest across near-the-money
    strikes (nearest expiration) per symbol.

    NOTE: this is the module most likely to need real debugging once tested
    live. Specifically unverified:
    - Generic tick types "100,101" are documented as Option Volume / Open
      Interest, but the exact `Ticker` attribute names IBKR populates them
      into (assumed here) haven't been confirmed against a live feed.
    - Near-the-money strike selection is a simplification of full chain
      scanning — good enough for a flow gauge, not exhaustive.
    - ES/NQ (futures options) are skipped entirely, matching the mock feed.
    """

    def __init__(self, ib, contracts, bar_feed):
        self._ib = ib
        self._option_tickers = {}

        for symbol in SYMBOLS:
            if OPTIONS_BASE_VOLUME.get(symbol.ticker, 0) == 0:
                continue

            underlying = contracts[symbol.ticker]
            chains = ib.reqSecDefOptParams(
                underlying.symbol, "", underlying.secType, underlying.conId
            )
            if not chains:
                continue

            chain = chains[0]
            expiration = sorted(chain.expirations)[0]
            price = bar_feed.latest_price(symbol.ticker)
            all_strikes = sorted(chain.strikes)
            if price is None:
                # Bars haven't arrived yet — fall back to the middle of the
                # chain rather than crashing; the next dashboard refresh will
                # have a real price to sort by.
                mid = len(all_strikes) // 2
                half = _STRIKES_EACH_SIDE
                strikes = all_strikes[max(0, mid - half) : mid + half]
            else:
                strikes = sorted(all_strikes, key=lambda s: abs(s - price))[
                    : _STRIKES_EACH_SIDE * 2
                ]

            calls, puts = [], []
            for strike in strikes:
                # tradingClass disambiguates products that share a symbol —
                # e.g. SPX (monthly, AM-settled) vs SPXW (weekly, PM-settled)
                # can have the same strike/expiration and are otherwise
                # ambiguous to IBKR, which fails contract qualification.
                call = Option(
                    symbol.ticker, expiration, strike, "C", chain.exchange,
                    currency="USD", tradingClass=symbol.ticker,
                )
                put = Option(
                    symbol.ticker, expiration, strike, "P", chain.exchange,
                    currency="USD", tradingClass=symbol.ticker,
                )
                ib.qualifyContracts(call, put)
                if not call.conId or not put.conId:
                    # Still unresolvable (ambiguous or doesn't exist) — skip
                    # this strike rather than crash on an unqualified contract.
                    continue
                calls.append(ib.reqMktData(call, "100,101", False, False))
                puts.append(ib.reqMktData(put, "100,101", False, False))

            self._option_tickers[symbol.ticker] = {"calls": calls, "puts": puts}

        self._call_vol_history = {s.ticker: deque(maxlen=_HISTORY_LEN) for s in SYMBOLS}
        self._put_vol_history = {s.ticker: deque(maxlen=_HISTORY_LEN) for s in SYMBOLS}

    def update(self):
        self._ib.sleep(0.15)
        for ticker, group in self._option_tickers.items():
            call_volume = sum(_finite_or_zero(t.volume) for t in group["calls"])
            put_volume = sum(_finite_or_zero(t.volume) for t in group["puts"])
            self._call_vol_history[ticker].append(call_volume)
            self._put_vol_history[ticker].append(put_volume)

    def get_options_data(self, ticker):
        if ticker not in self._option_tickers:
            return dict(_EMPTY_DATA)

        group = self._option_tickers[ticker]
        call_oi = sum(_finite_or_zero(getattr(t, "callOpenInterest", 0)) for t in group["calls"])
        put_oi = sum(_finite_or_zero(getattr(t, "putOpenInterest", 0)) for t in group["puts"])
        call_history = list(self._call_vol_history[ticker])
        put_history = list(self._put_vol_history[ticker])

        return {
            "call_volume": call_history[-1] if call_history else 0,
            "put_volume": put_history[-1] if put_history else 0,
            "call_oi": call_oi,
            "put_oi": put_oi,
            "call_volume_history": call_history,
            "put_volume_history": put_history,
        }
