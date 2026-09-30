/**
 * Outcome provider — the ONLY place that decides when balloons pop and which
 * balloons are golden.
 *
 * Contract:  createRound() → Promise<Round>
 *   Round   = { id, balloons: [BalloonOutcome, ...] }  (one per CONFIG.BALLOONS)
 *   BalloonOutcome = {
 *     golden,         boolean
 *     speed,          multiplier growth speed factor (1 normal, GOLDEN_SPEED golden)
 *     popTimeMs,      when it pops, in ms on the normal-speed flight clock
 *     popMultiplier,  multiplier shown at the moment of popping
 *     maxMultiplier,  the balloon pays out and floats away here if it survives
 *   }
 *
 * The round engine asks for the next round when betting OPENS but only reveals
 * it when bets LOCK. A server-authoritative, provably-fair version would publish
 * SHA256(serverSeed) at that point, derive each balloon from
 * HMAC_SHA256(serverSeed, `${roundId}:${balloonIndex}`), confirm cash-outs
 * server-side, and reveal serverSeed after the round so anyone can verify it.
 *
 * Odds. Every balloon, golden or normal, draws its pop point from the same
 * distribution: P(pop point ≥ x) = k / x with k = CONFIG.RTP, so every cash-out
 * target returns exactly the RTP. A golden balloon only inflates `speed`×
 * faster: it reaches the same pop point sooner. Both share the same maximum
 * multiplier.
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

  /** Survival constant k for a target RTP (the same for golden and normal balloons). */
  function survivalConstant(rtp = C.RTP) {
    return rtp;
  }

  /** Uniform sample → pop point (below 1 = instant pop). */
  function samplePopPoint(u, k = survivalConstant()) {
    const raw = k / (1 - u);
    return Math.min(C.MAX_MULTIPLIER, Math.max(1, BF.util.floor2(raw)));
  }

  /**
   * Builds one balloon's outcome from its pop point. Golden and normal balloons
   * with the same pop point pop at the same multiplier; the golden one gets
   * there `speed`× sooner.
   */
  function buildBalloon(popPoint, golden) {
    const speed = golden ? C.GOLDEN_SPEED : 1;
    const maxMultiplier = C.MAX_MULTIPLIER;
    return {
      golden,
      speed,
      popTimeMs: Math.log(popPoint) / (C.GROWTH_RATE * speed),
      popMultiplier: Math.min(maxMultiplier, popPoint),
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
    LocalRoundProvider, samplePopPoint, survivalConstant, buildBalloon, secureRandom,
  };
})();
