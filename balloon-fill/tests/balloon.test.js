const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./load');

const BF = loadGame();
const C = BF.CONFIG;
const { buildRound } = BF.outcome;

/** Time (ms) for a round of this speed to reach multiplier m. */
const timeFor = (m, speed = 1) => Math.log(m) / (C.GROWTH_RATE * speed);

function startSlot(popPoint, { golden = false, bet = 10, auto = null } = {}) {
  const slot = new BF.BalloonSlot(0);
  const events = [];
  slot.on('cashout', (r) => events.push(['cashout', r]));
  slot.on('pop', (r) => events.push(['pop', r]));
  slot.start(buildRound(popPoint, golden, 't'), bet, auto, 0);
  return { slot, events };
}

test('multiplier grows from 1.00x over time', () => {
  const { slot } = startSlot(50);
  slot.update(0);
  assert.equal(slot.multiplier, 1);
  slot.update(timeFor(2));
  assert.ok(Math.abs(slot.multiplier - 2) < 1e-9);
  assert.equal(slot.state, 'filling');
});

test('auto cash-out pays exactly the target when reached before the pop', () => {
  const { slot, events } = startSlot(3, { auto: 2 });
  slot.update(timeFor(2.5)); // past the target, even if the frame was late
  assert.equal(slot.state, 'cashed');
  assert.deepEqual(events[0][1], { won: true, multiplier: 2, payout: 20, auto: true, capped: false });
});

test('balloon pops before an unreached auto target', () => {
  const { slot, events } = startSlot(1.8, { auto: 2 });
  slot.update(timeFor(1.9));
  assert.equal(slot.state, 'popped');
  assert.equal(events[0][0], 'pop');
  assert.equal(events[0][1].multiplier, 1.8);
});

test('a backgrounded tab still resolves an auto cash-out that happened first', () => {
  const { slot } = startSlot(5, { auto: 2 });
  slot.update(timeFor(50)); // woke up long after the pop time
  assert.equal(slot.state, 'cashed');
  assert.equal(slot.result.multiplier, 2);
});

test('manual cash-out floors the multiplier to cents', () => {
  const { slot } = startSlot(10);
  const t = timeFor(2.3456);
  slot.update(t);
  assert.equal(slot.cashOut(t), true);
  assert.equal(slot.result.multiplier, 2.34);
  assert.equal(slot.result.payout, 23.4);
});

test('manual cash-out after the pop time loses the race', () => {
  const { slot } = startSlot(1.5);
  slot.update(timeFor(1.2));
  assert.equal(slot.cashOut(timeFor(1.6)), false);
  assert.equal(slot.state, 'popped');
});

test('instant pop at 1.00x', () => {
  const { slot } = startSlot(1);
  slot.update(0);
  assert.equal(slot.state, 'popped');
});

test('golden balloon inflates faster and auto-cashes at the cap', () => {
  const { slot, events } = startSlot(1000, { golden: true, bet: 5 });
  slot.update(timeFor(2, C.GOLDEN_SPEED));
  assert.ok(Math.abs(slot.multiplier - 2) < 1e-9);
  slot.update(timeFor(C.GOLDEN_CAP, C.GOLDEN_SPEED) + 1);
  assert.equal(slot.state, 'cashed');
  assert.deepEqual(events[0][1], { won: true, multiplier: C.GOLDEN_CAP, payout: 5 * C.GOLDEN_CAP, auto: true, capped: true });
});

test('golden balloon still honours a lower auto target', () => {
  const { slot } = startSlot(1000, { golden: true, auto: 3 });
  slot.update(timeFor(C.GOLDEN_CAP, C.GOLDEN_SPEED));
  assert.equal(slot.result.multiplier, 3);
  assert.equal(slot.result.capped, false);
});

test('golden balloon pops at the same moment a normal one would', () => {
  const popPoint = 2;
  const { slot } = startSlot(popPoint, { golden: true });
  slot.update(timeFor(popPoint) - 1);
  assert.equal(slot.state, 'filling');
  slot.update(timeFor(popPoint));
  assert.equal(slot.state, 'popped');
  assert.ok(Math.abs(slot.result.multiplier - BF.util.floor2(popPoint ** C.GOLDEN_SPEED)) < 1e-9);
});

test('cannot start a balloon that is already filling', () => {
  const { slot } = startSlot(5);
  assert.equal(slot.start(buildRound(2, false, 'x'), 1, null, 0), false);
});
