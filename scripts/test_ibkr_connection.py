"""Standalone connection smoke test — run this before the full dashboard.

Confirms IB Gateway/TWS is reachable and contracts resolve correctly for
every configured symbol, without touching bars/tape/options/internals yet.
Run locally with: python scripts/test_ibkr_connection.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import SYMBOLS
from data.ibkr_connection import connect, qualify_all

print("Connecting to IB Gateway/TWS...")
ib = connect()
print(f"Connected: {ib.isConnected()}")

server_time = ib.reqCurrentTime()
print(f"Server time: {server_time}")

print("\nResolving contracts for each symbol:")
contracts = qualify_all(ib)
for symbol in SYMBOLS:
    contract = contracts[symbol.ticker]
    print(f"  {symbol.ticker}: conId={contract.conId}  {contract}")

print("\nAccount summary:")
for row in ib.accountSummary():
    if row.tag in ("NetLiquidation", "AvailableFunds", "BuyingPower"):
        print(f"  {row.tag}: {row.value} {row.currency}")

ib.disconnect()
print("\nDone — disconnected cleanly.")
