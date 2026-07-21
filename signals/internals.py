import numpy as np

_TICK_EXTREME = 800
_ADD_THRESHOLD = 800
_VIX_CHANGE_THRESHOLD = 1.5


def compute_internals_signal(data):
    """Derive a VIX-change reading on top of the raw TICK/ADD/VIX internals."""
    tick = data["tick"]
    add = data["add"]
    vix = data["vix"]
    vix_history = data["vix_history"]

    vix_avg = np.mean(vix_history[:-1]) if len(vix_history) > 1 else vix
    vix_change = vix - vix_avg

    return {"tick": tick, "add": add, "vix": vix, "vix_change": vix_change}
