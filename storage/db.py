import json
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "signals_log.db"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS signal_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL,
            ticker TEXT NOT NULL,
            price REAL,
            signal TEXT,
            score INTEGER,
            reasons TEXT
        )
        """
    )
    conn.commit()
    conn.close()


def log_signal(ticker, result):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO signal_log (ts, ticker, price, signal, score, reasons) VALUES (?, ?, ?, ?, ?, ?)",
        (
            datetime.now().isoformat(),
            ticker,
            float(result["price"]),
            result["signal"],
            int(result["score"]),
            json.dumps(result["reasons"]),
        ),
    )
    conn.commit()
    conn.close()
