from ib_async import ContFuture, IB, Index, Stock

from config import AssetType, IBKR_CLIENT_ID, IBKR_HOST, IBKR_PORT, SYMBOLS


def connect():
    """Connect to a running TWS or IB Gateway instance.

    IB Gateway/TWS must already be started and logged in on this machine
    before calling this — this session cannot do that part for you.
    """
    ib = IB()
    ib.connect(IBKR_HOST, IBKR_PORT, clientId=IBKR_CLIENT_ID)
    # Fall back to delayed data automatically wherever no real-time
    # subscription is active, instead of every request erroring out.
    ib.reqMarketDataType(3)
    return ib


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
