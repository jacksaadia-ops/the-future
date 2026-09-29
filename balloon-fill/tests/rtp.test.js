const test = require('node:test');
const assert = require('node:assert/strict');
const { rtp, blended } = require('../tools/simulate');
const { loadGame } = require('./load');

const C = loadGame().CONFIG;
const N = 300000;

test('normal balloons return ~97% at any target', () => {
  for (const target of [1.5, 2, 5]) {
    const r = rtp(false, target, N);
    assert.ok(Math.abs(r - (1 - C.HOUSE_EDGE)) < 0.02, `target ${target}: ${r}`);
  }
});

test('golden balloon return is bounded by the cap: 0.97 * cap^(1 - 1/speed)', () => {
  // P(golden reaches cap) = 0.97 / cap^(1/speed), and it pays cap.
  const expected = (1 - C.HOUSE_EDGE) * C.GOLDEN_CAP ** (1 - 1 / C.GOLDEN_SPEED);
  const r = rtp(true, C.GOLDEN_CAP, N);
  assert.ok(Math.abs(r - expected) < 0.05, `golden at cap: ${r}, expected ${expected}`);
  assert.ok(rtp(true, 1000, N) < expected + 0.05, 'targets above the cap cannot beat the cap');
});

test('flat bettors stay below 100% overall even holding goldens to the cap', () => {
  const r = blended(N * 2, 2, C.GOLDEN_CAP);
  assert.ok(r < 1, `blended RTP ${r}`);
});
