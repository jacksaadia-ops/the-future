/**
 * Outcome provider — the ONLY place that decides when a balloon pops and
 * which balloon is golden.
 *
 * Contract:  createRound() → Promise<Round>
 *   Round = {
 *     id,             unique round id
 *     golden,         boolean
 *     speed,          multiplier growth speed factor (1 normal, GOLDEN_SPEED golden)
 *     popTimeMs,      ms after start when the balloon pops
 *     popMultiplier,  multiplier shown at the moment of popping
 *     maxMultiplier,  the balloon is auto cashed out here if it survives (golden cap)
 *   }
 *
 * The pop *time* is drawn from the same distribution for every balloon, so a
 * Golden Balloon has exactly the same chance of popping at any moment as a
 * normal one — it just inflates faster during that time, up to its cap.
 *
 * Golden schedule: every block of GOLDEN_EVERY rounds contains exactly one
 * golden round at a uniformly random position, so it can't be waited for.
 * NOTE: tracked per player here. A real backend should keep this schedule
 * server-side and secret (ideally global across all players) — a player who
 * counts their own rounds knows the last round of a golden-less block is golden.
 *
 * To go server-authoritative / provably fair, replace LocalOutcomeProvider with
 * one that asks the server for a round (e.g. HMAC(serverSeed, clientSeed:nonce))
 * and never exposes popTimeMs to the client until the round ends; cash-outs
 * would then be confirmed by the server instead of by BalloonSlot.
 */
(function () {
  const C = BF.CONFIG;

  /** Uniform float in [0, 1) from the CSPRNG (falls back to Math.random). */
  function secureRandom() {
    const cryptoObj = (typeof window !== 'undefined' && window.crypto) || globalThis.crypto;
    if (cryptoObj && cryptoObj.getRandomValues) {
      const buf = new Uint32Array(2);
      cryptoObj.getRandomValues(buf);
      // 52 bits of randomness
      return (buf[0] * 2 ** 20 + (buf[1] >>> 12)) / 2 ** 52;
    }
    return Math.random();
  }

  /**
   * Converts a uniform sample into a pop point on the normal-speed curve.
   * P(popPoint >= x) = (1 - edge) / x ; values below 1 are instant pops.
   */
  function samplePopPoint(u) {
    const raw = (1 - C.HOUSE_EDGE) / (1 - u);
    return Math.min(C.MAX_MULTIPLIER, Math.max(1, BF.util.floor2(raw)));
  }

  /** Builds a round from a normal-curve pop point. */
  function buildRound(popPoint, golden, id) {
    const popTimeMs = Math.log(popPoint) / C.GROWTH_RATE; // identical for golden & normal
    const speed = golden ? C.GOLDEN_SPEED : 1;
    const maxMultiplier = golden ? C.GOLDEN_CAP : C.MAX_MULTIPLIER;
    return {
      id,
      golden,
      speed,
      popTimeMs,
      popMultiplier: Math.min(maxMultiplier, Math.exp(C.GROWTH_RATE * speed * popTimeMs)),
      maxMultiplier,
    };
  }

  /** Tracks the "one golden per block, random position" schedule. */
  class GoldenSchedule {
    constructor(state, rand = secureRandom) {
      this.rand = rand;
      const valid = state && state.index >= 0 && state.index < C.GOLDEN_EVERY
        && state.goldenAt >= 0 && state.goldenAt < C.GOLDEN_EVERY;
      if (valid) {
        this.index = state.index;
        this.goldenAt = state.goldenAt;
      } else {
        this.newBlock();
      }
    }

    newBlock() {
      this.index = 0;
      this.goldenAt = Math.floor(this.rand() * C.GOLDEN_EVERY);
    }

    /** Consumes one round slot; returns true if it is the golden one. */
    next() {
      const golden = this.index === this.goldenAt;
      this.index += 1;
      if (this.index >= C.GOLDEN_EVERY) this.newBlock();
      return golden;
    }

    get state() { return { index: this.index, goldenAt: this.goldenAt }; }
  }

  let seq = 0;

  class LocalOutcomeProvider {
    constructor(savedState) {
      this.schedule = new GoldenSchedule(savedState);
    }

    async createRound() {
      const golden = this.schedule.next();
      return buildRound(samplePopPoint(secureRandom()), golden, `r${Date.now().toString(36)}-${++seq}`);
    }

    /** Persistable state (the golden schedule). */
    get state() { return this.schedule.state; }
  }

  BF.outcome = { LocalOutcomeProvider, GoldenSchedule, samplePopPoint, buildRound, secureRandom };
})();
