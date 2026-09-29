/**
 * Outcome provider — the ONLY place that decides when a balloon pops.
 *
 * Contract:  createRound({ allowGolden, goldenChance }) → Promise<Round>
 *   Round = {
 *     id,            unique round id
 *     golden,        boolean
 *     speed,         multiplier growth speed factor (1 normal, 2 golden)
 *     popTimeMs,     ms after start when the balloon pops
 *     popMultiplier, multiplier shown at the moment of popping
 *   }
 *
 * The pop *time* is drawn from the same distribution for every balloon, so a
 * Golden Balloon has exactly the same chance of popping at any moment as a
 * normal one — it just inflates twice as fast during that time.
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
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(2);
      window.crypto.getRandomValues(buf);
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

  let seq = 0;

  class LocalOutcomeProvider {
    async createRound({ allowGolden = true, goldenChance = C.GOLDEN_CHANCE } = {}) {
      const popPoint = samplePopPoint(secureRandom());
      const popTimeMs = Math.log(popPoint) / C.GROWTH_RATE; // same for golden & normal
      const golden = allowGolden && secureRandom() < goldenChance;
      const speed = golden ? C.GOLDEN_SPEED : 1;
      return {
        id: `r${Date.now().toString(36)}-${++seq}`,
        golden,
        speed,
        popTimeMs,
        popMultiplier: Math.min(C.MAX_MULTIPLIER, Math.exp(C.GROWTH_RATE * speed * popTimeMs)),
      };
    }
  }

  BF.outcome = { LocalOutcomeProvider, samplePopPoint, secureRandom };
})();
