from ib_async import ContFuture, IB, Index, Stock

from config import AssetType, IBKR_CLIENT_ID, IBKR_HOST, IBKR_PORT, REALTIME_SYMBOLS, SYMBOLS


def connect():
    """Connect to a running TWS or IB Gateway instance.

    IB Gateway/TWS must already be started and logged in on this machine
    before calling this — this session cannot do that part for you.
    """
    ib = IB()
    ib.connect(IBKR_HOST, IBKR_PORT, clientId=IBKR_CLIENT_ID)
    # Default to delayed; per-symbol requests switch to real-time via
    # set_market_data_type_for() wherever a subscription is active.
    ib.reqMarketDataType(3)
    return ib


def set_market_data_type_for(ib, ticker):
    """Switch the client's market data type before requesting data for a
    specific symbol. IBKR's marketDataType is a session-wide switch, not
    per-symbol, so callers must set it right before each per-symbol request:
    real-time (1) for tickers with an active subscription (REALTIME_SYMBOLS),
    delayed (3) otherwise — delayed doesn't auto-upgrade, and real-time
    doesn't auto-fall-back, so this has to be chosen explicitly each time.
    """
    ib.reqMarketDataType(1 if ticker in REALTIME_SYMBOLS else 3)


def make_contract(symbol):
    if symbol.asset_type in (AssetType.STOCK, AssetType.ETF):
        return Stock(symbol.ticker, "SMART", "USD")
    if symbol.asset_type == AssetType.INDEX:
        return Index(symbol.ticker, symbol.exchange, "USD")
    if symbol.asset_type == AssetType.FUTURE:
        # Continuous front-month contract — good for data, not for placing orders.
        return ContFuture(symbol.ticker, exchange=symbol.exchange, currency="USD")
    raise ValueError(f"Unhandled asset type for {symbol.ticker}")


def qualify_all(ib):
    """Resolve a Contract for every configured symbol, keyed by ticker."""
    contracts = {}
    for symbol in SYMBOLS:
        contract = make_contract(symbol)
        ib.qualifyContracts(contract)
        contracts[symbol.ticker] = contract
    return contracts
