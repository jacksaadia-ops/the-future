from collections import deque

from config import SYMBOLS

_MAX_PRINTS = 1000
_LARGE_PRINT_SIZE = 50


class IBKRTapeFeed:
    """Live time & sales via tick-by-tick 'AllLast' data, classified against
    the prevailing bid/ask midpoint to determine the aggressor side.

    NOTE: unverified against a live connection. In particular:
    - `Ticker.tickByTicks` accumulating as a list you can poll (rather than
      needing an event-callback pattern) is based on documented ib_async
      behavior, not a live test.
    - The large-print size threshold (50) was tuned against mock data and
      will likely need adjusting per symbol once real print sizes are seen.
    """

    def __init__(self, ib, contracts):
        self._ib = ib
        self._prints = {s.ticker: deque(maxlen=_MAX_PRINTS) for s in SYMBOLS}
        self._market_tickers = {}
        self._tick_tickers = {}
        self._seen_counts = {s.ticker: 0 for s in SYMBOLS}

        for symbol in SYMBOLS:
            contract = contracts[symbol.ticker]
            self._market_tickers[symbol.ticker] = ib.reqMktData(contract, "", False, False)
            self._tick_tickers[symbol.ticker] = ib.reqTickByTickData(contract, "AllLast", 0, False)

    def update(self):
        self._ib.sleep(0)
        for symbol in SYMBOLS:
            ticker = symbol.ticker
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
        return list(self._prints[ticker])[-n:]
