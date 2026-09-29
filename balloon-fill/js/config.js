/**
 * Global tunables. Everything that affects game math or pacing lives here so
 * it can later be served by a backend instead of hard-coded.
 */
window.BF = window.BF || {};

BF.CONFIG = Object.freeze({
  STARTING_BALANCE: 1000,
  MIN_BET: 0.1,
  MAX_BET: 10000,
  DEFAULT_BETS: [10, 10],
  DEFAULT_AUTO: [2.0, 5.0],

  // Multiplier curve: m(t) = e^(GROWTH_RATE * speed * t), t in ms.
  // 0.00012 → a normal balloon reaches 2x in ~5.8s and 10x in ~19s.
  GROWTH_RATE: 0.00012,
  GOLDEN_SPEED: 2,
  GOLDEN_CHANCE: 0.1,

  // Pop point distribution: P(normal balloon survives to x) = (1 - edge) / x.
  HOUSE_EDGE: 0.03,
  MAX_MULTIPLIER: 10000,

  RESULT_HOLD_MS: 2200, // how long the pop / cash-out result stays on screen
  FEED_MAX_ITEMS: 40,
  STORAGE_KEY: 'balloonfill.v1',
});
