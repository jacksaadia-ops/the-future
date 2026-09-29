/**
 * Global tunables. Everything that affects game math or pacing lives here so
 * it can later be served by a backend instead of hard-coded.
 */
window.BF = window.BF || {};

(function () {
  const RTP_OPTIONS = [0.94, 0.955, 0.96, 0.97];

  /** Operators pick one of RTP_OPTIONS; `?rtp=0.96` overrides it for testing. */
  function chosenRtp(fallback) {
    try {
      const v = parseFloat(new URLSearchParams(window.location.search).get('rtp'));
      return RTP_OPTIONS.includes(v) ? v : fallback;
    } catch (e) {
      return fallback;
    }
  }

  BF.CONFIG = Object.freeze({
    STARTING_BALANCE: 1000,
    MIN_BET: 0.1,
    MAX_BET: 10000,
    DEFAULT_BETS: [10, 10],
    DEFAULT_AUTO: [2.0, 5.0],

    // Overall return to player, INCLUDING golden balloons played optimally.
    // The normal-balloon odds are derived from this (see outcome.js).
    RTP: chosenRtp(0.955),
    RTP_OPTIONS,

    // Multiplier curve: m(t) = e^(GROWTH_RATE * speed * t), t in ms.
    // 0.00012 → a normal balloon reaches 2x in ~5.8s and 10x in ~19s.
    GROWTH_RATE: 0.00012,

    // Golden Balloon: each balloon independently has GOLDEN_CHANCE of turning
    // golden, revealed only after bets lock. It inflates GOLDEN_SPEED× faster,
    // pops at the same moment it otherwise would, and pays out at GOLDEN_CAP.
    GOLDEN_CHANCE: 0.01,
    GOLDEN_SPEED: 1.5,
    GOLDEN_CAP: 10,

    MAX_MULTIPLIER: 10000,

    // Long flights speed up: once a normal balloon passes WARP_FROM, its clock
    // runs WARP_SPEEDUP× faster. Pop points (and therefore odds) are unchanged;
    // rare high-flyers just finish sooner. Golden and normal balloons share the
    // same clock, so they still pop at exactly the same moment.
    WARP_FROM: 5,
    WARP_SPEEDUP: 3,

    // Auto bet: repeat a balloon's bet for up to AUTO_BET_MAX_ROUNDS rounds.
    // Operator setting — some markets restrict autoplay; set false to hide it.
    AUTO_BET: true,
    AUTO_BET_MAX_ROUNDS: 100,

    // Shared round timeline.
    BALLOONS: 2,
    BETTING_MS: 6000, // bets open
    REVEAL_MS: 1000, // bets locked, golden revealed, balloons about to fill
    ROUND_END_MS: 2000, // results on screen before the next betting window

    FEED_MAX_ITEMS: 40,
    STORAGE_KEY: 'balloonfill.v2',
  });
})();
