from collections import deque
from datetime import datetime, timezone

from signalrcore.hub_connection_builder import HubConnectionBuilder

from futures import config

_RECONNECT_POLICY = {"type": "interval", "keep_alive_interval": 10, "intervals": [1, 3, 5, 5, 5, 5]}


def _build_connection(hub_url, token):
    return (
        HubConnectionBuilder()
        .with_url(f"{hub_url}?access_token={token}", options={"skip_negotiation": True})
        .with_automatic_reconnect(_RECONNECT_POLICY)
        .build()
    )


class ProjectXRealtimeFeed:
    """Live quotes, time & sales, and DOM via the ProjectX Gateway market
    hub (SignalR over WebSocket). Verified against ProjectX's public
    real-time docs and the project-x-py SDK's hub wiring:
      - hub URL + JWT as an `access_token` query param, WebSocket-only
        transport (skip_negotiation)
      - GatewayQuote(contractId, data) / GatewayTrade / GatewayDepth events
      - SubscribeContractQuotes/Trades/MarketDepth([contractId]) to opt in

    Not yet exercised against a live account — the coarse shape (hub URL,
    event names, subscribe calls) is solid, but exact payload key casing
    may need a small adjustment the first time you see real traffic.
    """

    _MAX_TRADES = 2000

    # ProjectX DomType: Unknown=0, Ask=1, Bid=2, BestAsk=3, BestBid=4,
    # Trade=5, Reset=6, Low=7, High=8, NewBestBid=9, NewBestAsk=10, Fill=11
    _BID_TYPES = {2, 4, 9}
    _ASK_TYPES = {1, 3, 10}
    _RESET_TYPE = 6

    def __init__(self, client, contract_ids):
        self._client = client
        self._contract_ids = contract_ids  # {ticker: contractId}
        self._quotes = {}
        self._trades = {ticker: deque(maxlen=self._MAX_TRADES) for ticker in contract_ids}
        self._depth = {ticker: {"bids": {}, "asks": {}} for ticker in contract_ids}
        self._last_update = {ticker: None for ticker in contract_ids}
        self._connection = None

    def connect(self):
        self._connection = _build_connection(config.PROJECTX_MARKET_HUB_URL, self._client.token)
        self._connection.on("GatewayQuote", self._on_quote)
        self._connection.on("GatewayTrade", self._on_trade)
        self._connection.on("GatewayDepth", self._on_depth)
        self._connection.on_open(self._subscribe_all)
        self._connection.start()

    def _subscribe_all(self):
        for contract_id in self._contract_ids.values():
            self._connection.send("SubscribeContractQuotes", [contract_id])
            self._connection.send("SubscribeContractTrades", [contract_id])
            self._connection.send("SubscribeContractMarketDepth", [contract_id])

    def _ticker_for(self, contract_id):
        for ticker, cid in self._contract_ids.items():
            if cid == contract_id:
                return ticker
        return None

    def _on_quote(self, args):
        contract_id, data = args[0], args[1]
        ticker = self._ticker_for(contract_id)
        if ticker is None or not isinstance(data, dict):
            return
        self._quotes[ticker] = {
            "bid": data.get("bestBid"),
            "ask": data.get("bestAsk"),
            "last": data.get("lastPrice"),
            "volume": data.get("volume"),
        }
        self._last_update[ticker] = datetime.now(timezone.utc)

    def _on_trade(self, args):
        contract_id, data = args[0], args[1]
        ticker = self._ticker_for(contract_id)
        if ticker is None or data is None:
            return
        # Observed live: the gateway sends a *list* of trade entries per
        # event (occasionally just one), not a single dict — handle both.
        entries = data if isinstance(data, list) else [data]
        now = datetime.now(timezone.utc)
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            # TradeLogType: BUY=0, SELL=1 — the gateway reports the actual
            # aggressor side directly, no bid/ask-midpoint inference needed.
            side = "buy" if entry.get("type") == 0 else "sell"
            self._trades[ticker].append(
                {
                    "ts": now,
                    "price": entry.get("price"),
                    "size": entry.get("volume"),
                    "side": side,
                }
            )
        self._last_update[ticker] = now

    def _on_depth(self, args):
        contract_id, data = args[0], args[1]
        ticker = self._ticker_for(contract_id)
        if ticker is None or data is None:
            return
        levels = data if isinstance(data, list) else [data]
        book = self._depth[ticker]
        for level in levels:
            if not isinstance(level, dict):
                continue
            dom_type = level.get("type")
            price = level.get("price")
            volume = level.get("volume")
            if dom_type == self._RESET_TYPE:
                book["bids"].clear()
                book["asks"].clear()
                continue
            if price is None:
                continue
            if dom_type in self._BID_TYPES:
                side = "bids"
            elif dom_type in self._ASK_TYPES:
                side = "asks"
            else:
                continue
            if not volume:
                book[side].pop(price, None)
            else:
                book[side][price] = volume
        self._last_update[ticker] = datetime.now(timezone.utc)

    def get_quote(self, ticker):
        return self._quotes.get(ticker)

    def get_trades(self, ticker, n=200):
        return list(self._trades.get(ticker, []))[-n:]

    def get_depth(self, ticker, levels=10):
        book = self._depth.get(ticker, {"bids": {}, "asks": {}})
        bids = sorted(book["bids"].items(), key=lambda kv: -kv[0])[:levels]
        asks = sorted(book["asks"].items(), key=lambda kv: kv[0])[:levels]
        return {"bids": bids, "asks": asks}

    def seconds_since_update(self, ticker):
        last = self._last_update.get(ticker)
        if last is None:
            return None
        return (datetime.now(timezone.utc) - last).total_seconds()

    def disconnect(self):
        if self._connection:
            self._connection.stop()


class ProjectXUserFeed:
    """Live account balance, open positions, and today's realized P&L via
    the ProjectX Gateway user hub — used only to check your predefined risk
    rules (max daily loss / max position size) before surfacing a setup.
    This tool never places, modifies, or cancels orders.

    Caveat: ProjectX's Account payload doesn't appear to expose a ready-made
    "daily P&L" field, so this approximates it by summing each fill's
    profitAndLoss since the feed connected — restart the app mid-session
    and the running total restarts too. Good enough for a soft warning, not
    a substitute for checking your actual Topstep dashboard.
    """

    def __init__(self, client, account_id):
        self._client = client
        self._account_id = account_id
        self._balance = None
        self._positions = {}  # contractId -> signed size
        self._realized_pnl_since_connect = 0.0
        self._connection = None

    def connect(self):
        self._connection = _build_connection(config.PROJECTX_USER_HUB_URL, self._client.token)
        self._connection.on("GatewayUserAccount", self._on_account)
        self._connection.on("GatewayUserPosition", self._on_position)
        self._connection.on("GatewayUserTrade", self._on_trade)
        self._connection.on_open(self._subscribe_all)
        self._connection.start()

    def _subscribe_all(self):
        self._connection.send("SubscribeAccounts", [])
        self._connection.send("SubscribePositions", [int(self._account_id)])
        self._connection.send("SubscribeTrades", [int(self._account_id)])

    def _on_account(self, args):
        data = args[0]
        if str(data.get("id")) != str(self._account_id):
            return
        self._balance = data.get("balance")

    def _on_position(self, args):
        data = args[0]
        contract_id = data.get("contractId")
        if contract_id is not None:
            self._positions[contract_id] = data.get("size", 0)

    def _on_trade(self, args):
        data = args[0]
        pnl = data.get("profitAndLoss")
        if pnl is not None:
            self._realized_pnl_since_connect += pnl

    def snapshot(self):
        open_size = sum(abs(size) for size in self._positions.values())
        return {
            "balance": self._balance,
            "daily_pnl": self._realized_pnl_since_connect,
            "open_position_size": open_size,
        }

    def disconnect(self):
        if self._connection:
            self._connection.stop()
