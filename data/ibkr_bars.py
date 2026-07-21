import pandas as pd

from config import AssetType, SYMBOLS

# Indices don't have "trades" the way stocks/futures do, so historical data
# needs a different whatToShow value for them.
_WHAT_TO_SHOW = {
    AssetType.STOCK: "TRADES",
    AssetType.ETF: "TRADES",
    AssetType.FUTURE: "TRADES",
    AssetType.INDEX: "MIDPOINT",
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

    def update(self):
        # keepUpToDate bars update themselves via ib_async's event loop;
        # this just lets pending network events process.
        self._ib.sleep(0)

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
        return self._bars[ticker][-1].close
