const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./load');

const BF = loadGame();
const C = BF.CONFIG;
const { buildBalloon } = BF.outcome;
const balloon = (popPoint, golden = false) => new BF.SharedBalloon(0, buildBalloon(popPoint, golden));

test('time and multiplier stay consistent across the speed-up', () => {
  const b = balloon(5000);
  for (const m of [1.5, 2, 9.99, 10, 10.01, 50, 100, 1000]) {
    assert.ok(Math.abs(b.multiplierAt(b.timeFor(m)) - m) / m < 1e-9, `round trip at ${m}x`);
  }
});

test('no jump at the switch-over point', () => {
  const b = balloon(5000);
  const t = BF.flightClock.WARP_AT;
  assert.ok(Math.abs(b.multiplierAt(t - 1e-6) - C.WARP_FROM) < 1e-6);
  assert.ok(Math.abs(b.multiplierAt(t + 1e-6) - C.WARP_FROM) < 1e-6);
});

test('below the switch-over nothing changes; above it long flights are shorter', () => {
  const b = balloon(5000);
  const plain = (m) => Math.log(m) / C.GROWTH_RATE;
  assert.ok(Math.abs(b.timeFor(5) - plain(5)) < 1e-9);
  const t100 = b.timeFor(100);
  assert.ok(Math.abs(t100 - (plain(C.WARP_FROM) + (plain(100) - plain(C.WARP_FROM)) / C.WARP_SPEEDUP)) < 1e-9);
  assert.ok(t100 < plain(100));
});

test('golden and normal balloons with the same pop point still pop at the same moment', () => {
  for (const p of [1.5, 3, 50, 800]) {
    const g = balloon(p, true);
    const n = balloon(p, false);
    assert.equal(g.popTimeMs, n.popTimeMs);
  }
});

test('pop points and auto cash-out payouts are unchanged by the speed-up', () => {
  const b = balloon(60);
  b.update(b.endTimeMs);
  assert.equal(b.state, 'popped');
  assert.ok(Math.abs(b.multiplier - 60) < 1e-9);
  const slot = new BF.BetSlot(0);
  slot.place(10, 50);
  slot.activate();
  slot.resolve(b, b.endTimeMs);
  assert.deepEqual(slot.result, { won: true, multiplier: 50, payout: 500, auto: true, capped: false });
});
