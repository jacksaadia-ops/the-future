/**
 * Outcome provider — the ONLY place that decides when balloons pop and which
 * balloons are golden.
 *
 * Contract:  createRound() → Promise<Round>
 *   Round   = { id, balloons: [BalloonOutcome, ...] }  (one per CONFIG.BALLOONS)
 *   BalloonOutcome = {
 *     golden,         boolean
 *     speed,          multiplier growth speed factor (1 normal, GOLDEN_SPEED golden)
 *     popTimeMs,      ms after launch when the balloon pops
 *     popMultiplier,  multiplier shown at the moment of popping
 *     maxMultiplier,  the balloon pays out and floats away here if it survives (golden cap)
 *   }
 *
 * The round engine asks for the next round when betting OPENS but only reveals
 * it when bets LOCK. A server-authoritative, provably-fair version would publish
 * SHA256(serverSeed) at that point, derive each balloon from
 * HMAC_SHA256(serverSeed, `${roundId}:${balloonIndex}`), confirm cash-outs
 * server-side, and reveal serverSeed after the round so anyone can verify it.
 *
 * Odds. For a normal balloon P(pop point ≥ x) = k / x, so every cash-out
 * target returns k. A golden balloon pops at the same TIME a normal one would
 * but inflates `speed`× faster, so its best cash-out returns about
 * k · cap^(1 − 1/speed) (goldenFactor() computes it exactly on the 0.01 grid).
 * k is chosen so that the overall return, with goldens played optimally,
 * equals CONFIG.RTP exactly:
 *     RTP = k · [(1 − p) + p · goldenFactor()]
 */
(function () {
  const C = BF.CONFIG;

  /** Uniform float in [0, 1) from the CSPRNG (falls back to Math.random). */
  function secureRandom() {
    const cryptoObj = (typeof window !== 'undefined' && window.crypto) || globalThis.crypto;
    if (cryptoObj && cryptoObj.getRandomValues) {
      const buf = new Uint32Array(2);
      cryptoObj.getRandomValues(buf);
      return (buf[0] * 2 ** 20 + (buf[1] >>> 12)) / 2 ** 52; // 52 random bits
    }
    return Math.random();
  }

  const ceil2 = (v) => Math.ceil(v * 100 - 1e-9) / 100;

  /**
   * Return of a golden balloon cashed out at `target` (on the 0.01 grid), per unit of k.
   * It reaches y exactly when its normal-curve pop point is ≥ y^(1/speed); pop points
   * are whole cents, so that probability is k / ceil2(y^(1/speed)).
   */
  function goldenReturn(target) {
    const y = Math.min(target, C.GOLDEN_CAP);
    return y / ceil2(y ** (1 / C.GOLDEN_SPEED));
  }

  let goldenBest = null;
  /**
   * Best achievable return of a golden balloon, per unit of k, over every
   * possible cash-out target. (Continuous approximation: cap^(1 − 1/speed);
   * cent rounding makes a target just under the cap marginally best.)
   */
  function goldenFactor() {
    if (!goldenBest) {
      goldenBest = { factor: 0, target: 0 };
      for (let c = 101; c <= Math.round(C.GOLDEN_CAP * 100); c++) {
        const f = goldenReturn(c / 100);
        if (f > goldenBest.factor) goldenBest = { factor: f, target: c / 100 };
      }
    }
    return goldenBest.factor;
  }

  /** The golden cash-out target that achieves goldenFactor(). */
  function goldenBestTarget() {
    goldenFactor();
    return goldenBest.target;
  }

  /** Survival constant k for a target overall RTP. */
  function survivalConstant(rtp = C.RTP) {
    const p = C.GOLDEN_CHANCE;
    return rtp / ((1 - p) + p * goldenFactor());
  }

  /** Uniform sample → pop point on the normal-speed curve (below 1 = instant pop). */
  function samplePopPoint(u, k = survivalConstant()) {
    const raw = k / (1 - u);
    return Math.min(C.MAX_MULTIPLIER, Math.max(1, BF.util.floor2(raw)));
  }

  /** Builds one balloon's outcome from a normal-curve pop point. */
  function buildBalloon(popPoint, golden) {
    const popTimeMs = Math.log(popPoint) / C.GROWTH_RATE; // identical for golden & normal
    const speed = golden ? C.GOLDEN_SPEED : 1;
    const maxMultiplier = golden ? C.GOLDEN_CAP : C.MAX_MULTIPLIER;
    return {
      golden,
      speed,
      popTimeMs,
      popMultiplier: Math.min(maxMultiplier, Math.exp(C.GROWTH_RATE * speed * popTimeMs)),
      maxMultiplier,
    };
  }

  let seq = 0;

  class LocalRoundProvider {
    constructor({ rtp = C.RTP, rand = secureRandom } = {}) {
      this.k = survivalConstant(rtp);
      this.rand = rand;
    }

    async createRound() {
      return this.createRoundSync();
    }

    createRoundSync() {
      const balloons = [];
      for (let i = 0; i < C.BALLOONS; i++) {
        const popPoint = samplePopPoint(this.rand(), this.k);
        balloons.push(buildBalloon(popPoint, this.rand() < C.GOLDEN_CHANCE));
      }
      return { id: `r${Date.now().toString(36)}-${++seq}`, balloons };
    }
  }

  BF.outcome = {
    LocalRoundProvider, samplePopPoint, survivalConstant, goldenFactor, goldenReturn, goldenBestTarget,
    buildBalloon, secureRandom,
  };
})();
