from dataclasses import dataclass
from enum import Enum


class AssetType(Enum):
    STOCK = "stock"
    ETF = "etf"
    INDEX = "index"
    FUTURE = "future"


@dataclass(frozen=True)
class Symbol:
    ticker: str
    asset_type: AssetType
    exchange: str
    description: str = ""


SYMBOLS = [
    Symbol("SPX", AssetType.INDEX, "CBOE", "S&P 500 Index"),
    Symbol("NDX", AssetType.INDEX, "NASDAQ", "Nasdaq-100 Index"),
    Symbol("ES", AssetType.FUTURE, "CME", "E-mini S&P 500 Future"),
    Symbol("NQ", AssetType.FUTURE, "CME", "E-mini Nasdaq-100 Future"),
    Symbol("SPY", AssetType.ETF, "ARCA", "SPDR S&P 500 ETF"),
    Symbol("TSLA", AssetType.STOCK, "NASDAQ", "Tesla Inc"),
    Symbol("NVDA", AssetType.STOCK, "NASDAQ", "NVIDIA Corp"),
    Symbol("HOOD", AssetType.STOCK, "NASDAQ", "Robinhood Markets Inc"),
]

# "mock" for local development without a broker connection.
# "ibkr_paper" / "ibkr_live" are wired up in a later phase.
DATA_MODE = "mock"

# Shared mock-data parameters, used by both the bar feed and the tape feed
# so simulated prices stay in the same ballpark across both.
BASE_PRICE = {
    "SPX": 5600.0,
    "NDX": 19700.0,
    "ES": 5605.0,
    "NQ": 19720.0,
    "SPY": 560.0,
    "TSLA": 245.0,
    "NVDA": 135.0,
    "HOOD": 38.0,
}

# Per-bar/per-tick volatility as a fraction of price. Futures/indices tighter, single stocks wider.
VOLATILITY = {
    "SPX": 0.0006,
    "NDX": 0.0007,
    "ES": 0.0006,
    "NQ": 0.0007,
    "SPY": 0.0006,
    "TSLA": 0.0025,
    "NVDA": 0.0020,
    "HOOD": 0.0030,
}

# Minimum price increment per tick.
TICK_SIZE = {
    "SPX": 0.05,
    "NDX": 0.05,
    "ES": 0.25,
    "NQ": 0.25,
    "SPY": 0.01,
    "TSLA": 0.01,
    "NVDA": 0.01,
    "HOOD": 0.01,
}

# Rough baseline options contract volume per update tick, and starting open interest.
# Index/ETF options trade far heavier than single-stock names.
OPTIONS_BASE_VOLUME = {
    "SPX": 4000,
    "NDX": 1500,
    "ES": 0,  # futures options not modeled yet
    "NQ": 0,
    "SPY": 3500,
    "TSLA": 2500,
    "NVDA": 3000,
    "HOOD": 400,
}

OPTIONS_BASE_OI = {
    "SPX": 200000,
    "NDX": 80000,
    "ES": 0,
    "NQ": 0,
    "SPY": 250000,
    "TSLA": 150000,
    "NVDA": 180000,
    "HOOD": 20000,
}

IBKR_HOST = "127.0.0.1"
IBKR_PORT = 4001  # 7497 = TWS paper, 7496 = TWS live, 4002 = IB Gateway paper, 4001 = IB Gateway live (in use)
IBKR_CLIENT_ID = 7

# Tickers with an active real-time market data subscription on your IBKR
# account. Everything else automatically falls back to delayed data — add
# tickers here as you subscribe to more real-time feeds.
REALTIME_SYMBOLS = {"ES", "NQ"}

# Technical indicator parameters
MA_FAST = 9
MA_SLOW = 21
RSI_PERIOD = 14

REFRESH_INTERVAL_SECONDS = 2
