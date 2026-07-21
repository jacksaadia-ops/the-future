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

IBKR_HOST = "127.0.0.1"
IBKR_PORT = 7497  # 7497 = TWS paper, 7496 = TWS live, 4002 = IB Gateway paper, 4001 = IB Gateway live
IBKR_CLIENT_ID = 7

# Technical indicator parameters
MA_FAST = 9
MA_SLOW = 21
RSI_PERIOD = 14

REFRESH_INTERVAL_SECONDS = 2
