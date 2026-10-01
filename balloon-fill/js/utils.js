/** Small shared helpers. */
(function () {
  class Emitter {
    constructor() { this._handlers = {}; }
    on(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); return this; }
    emit(evt, payload) { (this._handlers[evt] || []).forEach((fn) => fn(payload)); }
  }

  // Cents as usual; a sub-cent remainder (e.g. $0.10 × 1.05 = $0.105) is shown rather than rounded away.
  const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const SCALE = 10000; // wallet precision: 1/10,000 of a dollar

  BF.util = {
    Emitter,
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    round2: (v) => Math.round(v * 100) / 100,
    floor2: (v) => Math.floor(v * 100 + 1e-9) / 100,
    money: (v) => '$' + moneyFmt.format(v),
    /** Exact payout: stake in cents × multiplier in hundredths, never rounded to the cent. */
    payout: (amount, multiplier) => (Math.round(amount * 100) * Math.floor(multiplier * 100 + 1e-7)) / SCALE,
    toUnits: (v) => Math.round(v * SCALE),
    SCALE,
    /** RTP as a label without needless decimals: 0.955 → "95.5%", 0.97 → "97%". */
    rtp: (r) => `${+(r * 100).toFixed(2)}%`,
    mult: (v) => (v >= 1000 ? Math.floor(v).toLocaleString('en-US') : v.toFixed(2)) + 'x',
    rand: (lo, hi) => lo + Math.random() * (hi - lo),
    randInt: (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    $: (sel, root = document) => root.querySelector(sel),

    /** Collects every [data-ref] inside root into an object keyed by ref name. */
    refs(root) {
      const out = {};
      root.querySelectorAll('[data-ref]').forEach((el) => { out[el.dataset.ref] = el; });
      return out;
    },
  };
})();
