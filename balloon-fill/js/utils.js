/** Small shared helpers. */
(function () {
  class Emitter {
    constructor() { this._handlers = {}; }
    on(evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); return this; }
    emit(evt, payload) { (this._handlers[evt] || []).forEach((fn) => fn(payload)); }
  }

  const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  BF.util = {
    Emitter,
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    round2: (v) => Math.round(v * 100) / 100,
    floor2: (v) => Math.floor(v * 100 + 1e-9) / 100,
    money: (v) => '$' + moneyFmt.format(v),
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
