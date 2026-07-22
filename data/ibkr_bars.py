import pandas as pd

from config import AssetType, SYMBOLS
from data.ibkr_connection import set_market_data_type_for

_WHAT_TO_SHOW = {
    AssetType.STOCK: "TRADES",
    AssetType.ETF: "TRADES",
    AssetType.FUTURE: "TRADES",
    # Confirmed against a live account: indices publish periodic computed-value
    # prints under "TRADES" too, despite not being directly tradable.
    # MIDPOINT (the original guess) returned "No historical market data".
    AssetType.INDEX: "TRADES",
}


class IBKRBarFeed:
    """Live 1-minute bars via IBKR historical-data-with-live-updates.

    NOTE: built from documented ib_async behavior, not yet verified against
    a live connection. whatToShow for indices and the exact bar-close
    semantics of keepUpToDate are the parts most likely to need adjusting
    once tested against a real account.
    """

    def __init__(self, ib, contracts):
        self._ib = ib
        self._bars = {}
        for symbol in SYMBOLS:
            contract = contracts[symbol.ticker]
            set_market_data_type_for(ib, symbol.ticker)
            bar_list = ib.reqHistoricalData(
                contract,
                endDateTime="",
                durationStr="1 D",
                barSizeSetting="1 min",
                whatToShow=_WHAT_TO_SHOW[symbol.asset_type],
                useRTH=False,
                keepUpToDate=True,
            )
            self._bars[symbol.ticker] = bar_list

        # reqHistoricalData returns immediately with an empty list — the actual
        # bars arrive asynchronously. Wait (with a timeout) until every symbol
        # has at least one bar, so callers don't hit an empty list right after
        # construction.
        for _ in range(100):  # up to ~10s total
            if all(len(bars) > 0 for bars in self._bars.values()):
                break
            self._ib.sleep(0.1)

    def update(self):
        # keepUpToDate bars update themselves via ib_async's event loop;
        # this just lets pending network events process.
        self._ib.sleep(0.15)

    def get_bars(self, ticker):
        bar_list = self._bars[ticker]
        return pd.DataFrame(
            {
                "open": [b.open for b in bar_list],
                "high": [b.high for b in bar_list],
                "low": [b.low for b in bar_list],
                "close": [b.close for b in bar_list],
                "volume": [b.volume for b in bar_list],
            },
            index=[b.date for b in bar_list],
        )

    def latest_price(self, ticker):
        bar_list = self._bars[ticker]
        return bar_list[-1].close if bar_list else None
