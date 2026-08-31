from datetime import datetime, timedelta, timezone

import pandas as pd

from futures import config


class ProjectXBarFeed:
    """1-minute bars via ProjectX's History/retrieveBars, polled on every
    update() call. Simpler and more robust than hand-aggregating bars from
    the trade stream, at the cost of one REST call per symbol per refresh
    cycle (REFRESH_INTERVAL_SECONDS controls how often that happens).
    """

    def __init__(self, client, contract_ids):
        self._client = client
        self._contract_ids = contract_ids
        self._bars = {ticker: pd.DataFrame(columns=["open", "high", "low", "close", "volume"]) for ticker in contract_ids}
        self._last_poll = {ticker: None for ticker in contract_ids}

    def update(self):
        now = datetime.now(timezone.utc)
        start = now - timedelta(hours=config.HISTORY_LOOKBACK_HOURS)
        for ticker, contract_id in self._contract_ids.items():
            bars = self._client.retrieve_bars(
                contract_id,
                unit=config.BAR_UNIT_MINUTE,
                unit_number=1,
                start_time=start.isoformat(),
                end_time=now.isoformat(),
                limit=config.HISTORY_LOOKBACK_HOURS * 60,
                # Evaluation/Combine accounts appear to only have access to
                # the simulated ("live": False) history feed — "live": True
                # returned errorCode 1 with no message against a Combine
                # account. Revisit once trading a funded/live account.
                live=False,
                include_partial_bar=True,
            )
            if not bars:
                continue
            # Temporary debug print — confirms whether the bars we're
            # getting are actually recent/current, and shows the raw last
            # two entries so a scaling or wrong-timeframe issue is visible.
            print(f"[ProjectX] {ticker}: got {len(bars)} bars, now={now.isoformat()}")
            print(f"[ProjectX] {ticker} last 2 raw bars: {bars[-2:]}")
            df = pd.DataFrame(
                {
                    "open": [b["o"] for b in bars],
                    "high": [b["h"] for b in bars],
                    "low": [b["l"] for b in bars],
                    "close": [b["c"] for b in bars],
                    "volume": [b["v"] for b in bars],
                },
                index=pd.to_datetime([b["t"] for b in bars], utc=True),
            )
            # ProjectX returns bars newest-first (descending) — confirmed
            # against a live account, where the naive last row was actually
            # one of the OLDEST bars in the window. Sort ascending so every
            # downstream consumer (latest_price, VWAP, market structure)
            # can keep assuming standard oldest-first OHLCV ordering.
            self._bars[ticker] = df.sort_index()
            self._last_poll[ticker] = now

    def get_bars(self, ticker):
        return self._bars[ticker].copy()

    def latest_price(self, ticker):
        df = self._bars[ticker]
        return df["close"].iloc[-1] if len(df) else None

    def seconds_since_update(self, ticker):
        last = self._last_poll.get(ticker)
        if last is None:
            return None
        return (datetime.now(timezone.utc) - last).total_seconds()
