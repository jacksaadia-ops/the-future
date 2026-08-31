"""Structure-only backtest of the futures setup engine against real
historical bars from your TopstepX/ProjectX account.

See futures/backtest.py for the important limitation: this can only
replay the market-structure trigger + target logic, not the order-flow
confirmation votes the live dashboard also requires (no historical tick
data available via this API). Treat the results as a base rate, not a
backtest of the live system's full behavior.

Usage:
    PROJECTX_USERNAME=... PROJECTX_API_KEY=... python scripts/backtest_futures.py --days 10
"""

import argparse
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd

from futures import config
from futures.backtest import simulate_trades, summarize
from futures.client import ProjectXClient, ProjectXError


def fetch_historical_bars(client, contract_id, days):
    """Pull bars in daily chunks (retrieveBars' per-request bar count isn't
    documented/guaranteed, so chunking is safer than one huge request) and
    concatenate, sorted ascending — see futures/bars.py for why sorting is
    required (ProjectX returns bars newest-first).
    """
    all_bars = []
    now = datetime.now(timezone.utc)
    for day_offset in range(days, 0, -1):
        day_end = now - timedelta(days=day_offset - 1)
        day_start = now - timedelta(days=day_offset)
        bars = None
        for attempt in range(4):
            try:
                bars = client.retrieve_bars(
                    contract_id,
                    unit=config.BAR_UNIT_MINUTE,
                    unit_number=1,
                    start_time=day_start.isoformat(),
                    end_time=day_end.isoformat(),
                    limit=2000,
                    live=False,
                    include_partial_bar=False,
                )
                break
            except ProjectXError as e:
                wait = 2**attempt
                print(f"  [{day_start.date()}] request failed ({e}); retrying in {wait}s...")
                time.sleep(wait)
        if bars:
            all_bars.extend(bars)
        print(f"  [{day_start.date()}] {len(bars) if bars else 0} bars")
        time.sleep(0.3)  # be polite to the rate limit

    if not all_bars:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])

    df = pd.DataFrame(
        {
            "open": [b["o"] for b in all_bars],
            "high": [b["h"] for b in all_bars],
            "low": [b["l"] for b in all_bars],
            "close": [b["c"] for b in all_bars],
            "volume": [b["v"] for b in all_bars],
        },
        index=pd.to_datetime([b["t"] for b in all_bars], utc=True),
    )
    return df[~df.index.duplicated(keep="first")].sort_index()


def print_report(ticker, stats):
    print(f"\n=== {ticker} ===")
    if stats["count"] == 0:
        print("No trades triggered in this window.")
        return
    print(f"Trades: {stats['count']}  (wins {stats['wins']} / losses {stats['losses']} / timeouts {stats['timeouts']})")
    print(f"Win rate (T1 before stop): {stats['win_rate']:.1%}")
    print(f"Avg R / expectancy: {stats['avg_r']:+.2f}R")
    print(f"Total R: {stats['total_r']:+.2f}R")
    print(f"Max drawdown: {stats['max_drawdown_r']:.2f}R")
    print(f"Reached T2+ before stop: {stats['t2_or_better_rate']:.1%}   Reached T3: {stats['t3_rate']:.1%}")
    print("By setup:")
    for setup, row in stats["by_setup"].items():
        print(f"  {setup}: {row['count']} trades, avg {row['mean']:+.2f}R")
    print("By direction:")
    for direction, row in stats["by_direction"].items():
        print(f"  {direction}: {row['count']} trades, avg {row['mean']:+.2f}R")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=10, help="How many calendar days of history to pull (default 10)")
    parser.add_argument("--csv", type=str, default=None, help="Optional path to save every simulated trade as CSV")
    args = parser.parse_args()

    if not (config.PROJECTX_USERNAME and config.PROJECTX_API_KEY):
        print("PROJECTX_USERNAME / PROJECTX_API_KEY must be set as environment variables.")
        sys.exit(1)

    print(
        f"Fetching ~{args.days} days of 1-minute bars for {', '.join(config.CONTRACTS)}. "
        "This can take a while (rate-limited, one request per day per contract)..."
    )
    client = ProjectXClient()
    all_trades = []
    for ticker in config.CONTRACTS:
        results = client.search_contracts(config.CONTRACT_SEARCH_TEXT[ticker], live=False)
        if not results:
            print(f"No contract found for {ticker}, skipping.")
            continue
        contract_id = results[0]["id"]
        print(f"\n{ticker} -> {contract_id}")
        df = fetch_historical_bars(client, contract_id, args.days)
        print(f"  Total bars fetched: {len(df)}")
        if df.empty:
            continue

        print(f"  Simulating trades (this is the slow part — recomputing structure per bar)...")
        start = time.time()
        trades = simulate_trades(df, ticker)
        print(f"  Done in {time.time() - start:.1f}s — {len(trades)} simulated trades")
        all_trades.extend(trades)
        print_report(ticker, summarize(trades))

    if args.csv and all_trades:
        pd.DataFrame(all_trades).to_csv(args.csv, index=False)
        print(f"\nSaved {len(all_trades)} trades to {args.csv}")

    print(
        "\nReminder: this only tests the market-structure trigger, not the order-flow "
        "confirmation the live dashboard also requires (no historical tick data available). "
        "Treat this as a base rate / lower bound, not a full backtest of the live system."
    )


if __name__ == "__main__":
    main()
