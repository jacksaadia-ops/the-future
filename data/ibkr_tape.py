from collections import deque

from config import AssetType, SYMBOLS
from data.ibkr_connection import set_market_data_type_for

_MAX_PRINTS = 1000
_LARGE_PRINT_SIZE = 50


class IBKRTapeFeed:
    """Live time & sales via tick-by-tick 'AllLast' data, classified against
    the prevailing bid/ask midpoint to determine the aggressor side.

    Indices (SPX, NDX) are skipped entirely — confirmed against a live
    account that IBKR rejects AllLast tick-by-tick requests for them
    ("not supported"), since an index has no actual executed trade tape,
    only a computed value. compute_tape_signal() already handles an empty
    print list as neutral, so these just show no tape data.

    NOTE: still only partially verified against a live connection —
    `Ticker.tickByTicks` accumulating as a pollable list worked in testing,
    but the large-print size threshold (50) was tuned against mock data and
    will likely need adjusting per symbol once real print sizes are seen.
    """

    def __init__(self, ib, contracts):
        self._ib = ib
        self._tradeable_tickers = [s.ticker for s in SYMBOLS if s.asset_type != AssetType.INDEX]
        self._prints = {ticker: deque(maxlen=_MAX_PRINTS) for ticker in self._tradeable_tickers}
        self._market_tickers = {}
        self._tick_tickers = {}
        self._seen_counts = {ticker: 0 for ticker in self._tradeable_tickers}

        for symbol in SYMBOLS:
            if symbol.asset_type == AssetType.INDEX:
                continue
            contract = contracts[symbol.ticker]
            set_market_data_type_for(ib, symbol.ticker)
            self._market_tickers[symbol.ticker] = ib.reqMktData(contract, "", False, False)
            self._tick_tickers[symbol.ticker] = ib.reqTickByTickData(contract, "AllLast", 0, False)

    def update(self):
        self._ib.sleep(0)
        for ticker in self._tradeable_tickers:
            tick_ticker = self._tick_tickers[ticker]
            all_ticks = tick_ticker.tickByTicks or []
            new_ticks = all_ticks[self._seen_counts[ticker] :]
            self._seen_counts[ticker] = len(all_ticks)
            if not new_ticks:
                continue

            market = self._market_tickers[ticker]
            bid, ask = market.bid, market.ask

            for tick in new_ticks:
                price = tick.price
                size = tick.size
                if bid and ask and bid > 0 and ask > 0:
                    side = "buy" if price >= (bid + ask) / 2 else "sell"
                else:
                    side = "buy"
                self._prints[ticker].append(
                    {
                        "ts": tick.time,
                        "price": price,
                        "size": size,
                        "side": side,
                        "large": size >= _LARGE_PRINT_SIZE,
                    }
                )

    def get_prints(self, ticker, n=200):
        if ticker not in self._prints:
            return []  # indices (SPX, NDX) have no trade tape
        return list(self._prints[ticker])[-n:]
