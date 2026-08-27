class AlertTracker:
    """Tracks the most recent TRADE ALERT per ticker across refresh cycles so
    the engine can flag SETUP INVALID / TARGET REACHED before generating a
    new setup for that ticker.

    This tool never knows whether you actually took the trade — it only
    watches whether ITS last alert's stop or first target was subsequently
    touched, which is the best a manual-execution-only assistant can do.
    """

    def __init__(self):
        self._active = {}  # ticker -> alert dict

    def check(self, ticker, price):
        alert = self._active.get(ticker)
        if alert is None or price is None:
            return None
        stop = alert["stop"]
        t1 = alert["targets"][0]
        is_long = alert["direction"] == "LONG"
        hit_stop = price <= stop if is_long else price >= stop
        hit_target = price >= t1 if is_long else price <= t1
        if hit_stop:
            del self._active[ticker]
            return {"kind": "setup_invalid", "ticker": ticker, "setup": alert["setup"]}
        if hit_target:
            del self._active[ticker]
            return {"kind": "target_reached", "ticker": ticker, "setup": alert["setup"], "target": t1}
        return None

    def record(self, ticker, result):
        if result.get("kind") == "trade_alert":
            self._active[ticker] = result
