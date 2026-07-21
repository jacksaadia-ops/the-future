import numpy as np

_UNUSUAL_VOLUME_MULTIPLE = 2.5
_PUT_CALL_BULLISH = 0.7
_PUT_CALL_BEARISH = 1.3


def compute_options_signal(data):
    """Derive put/call ratio and unusual-volume flags from options feed data."""
    call_volume = data["call_volume"]
    put_volume = data["put_volume"]
    call_history = data["call_volume_history"]
    put_history = data["put_volume_history"]

    if call_volume == 0 and put_volume == 0:
        return {
            "call_volume": 0,
            "put_volume": 0,
            "put_call_ratio": 1.0,
            "call_oi": data["call_oi"],
            "put_oi": data["put_oi"],
            "unusual_call_volume": False,
            "unusual_put_volume": False,
        }

    put_call_ratio = put_volume / call_volume if call_volume else float("inf")

    call_avg = np.mean(call_history[:-1]) if len(call_history) > 1 else call_volume
    put_avg = np.mean(put_history[:-1]) if len(put_history) > 1 else put_volume

    unusual_call = bool(call_avg > 0 and call_volume > call_avg * _UNUSUAL_VOLUME_MULTIPLE)
    unusual_put = bool(put_avg > 0 and put_volume > put_avg * _UNUSUAL_VOLUME_MULTIPLE)

    return {
        "call_volume": call_volume,
        "put_volume": put_volume,
        "put_call_ratio": put_call_ratio,
        "call_oi": data["call_oi"],
        "put_oi": data["put_oi"],
        "unusual_call_volume": unusual_call,
        "unusual_put_volume": unusual_put,
    }
