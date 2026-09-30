const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./load');

const BF = loadGame();
const C = BF.CONFIG;
const { buildBalloon } = BF.outcome;

const timeFor = (m, speed = 1) => Math.log(m) / (C.GROWTH_RATE * speed);

/** A bet locked on a fresh shared balloon. */
function activeBet(popPoint, { golden = false, amount = 10, auto = null } = {}) {
  const balloon = new BF.SharedBalloon(0, buildBalloon(popPoint, golden));
  const slot = new BF.BetSlot(0);
  const events = [];
  slot.on('cashout', (r) => events.push(['cashout', r]));
  slot.on('lost', (r) => events.push(['lost', r]));
  slot.place(amount, auto);
  slot.activate();
  const at = (t) => { balloon.update(t); slot.resolve(balloon, t); };
  return { balloon, slot, events, at };
}

test('bet lifecycle: place → cancel refunds, place → activate locks', () => {
  const slot = new BF.BetSlot(0);
  assert.equal(slot.place(5, null), true);
  assert.equal(slot.place(5, null), false, 'one bet per balloon per round');
  assert.equal(slot.cancel(), true);
  assert.equal(slot.status, 'none');
  slot.place(5, 2);
  slot.activate();
  assert.equal(slot.status, 'active');
  assert.equal(slot.cancel(), false, 'cannot cancel after bets lock');
});

test('auto cash-out pays exactly the target when reached before the pop', () => {
  const { slot, events, at } = activeBet(3, { auto: 2 });
  at(timeFor(2.5));
  assert.equal(slot.status, 'cashed');
  assert.deepEqual(events[0][1], { won: true, multiplier: 2, payout: 20, auto: true, capped: false });
});

test('bet is lost when the balloon pops before the target', () => {
  const { slot, events, at } = activeBet(1.8, { auto: 2 });
  at(timeFor(1.9));
  assert.equal(slot.status, 'lost');
  assert.equal(events[0][1].multiplier, 1.8);
});

test('auto cash-out still wins if the frame arrives after the pop', () => {
  const { slot, at } = activeBet(5, { auto: 2 });
  at(timeFor(50));
  assert.equal(slot.result.multiplier, 2);
});

test('manual cash-out floors to cents and only while filling', () => {
  const { balloon, slot, at } = activeBet(10);
  at(timeFor(2.3456));
  assert.equal(slot.cashOut(balloon), true);
  assert.equal(slot.result.multiplier, 2.34);
  assert.equal(slot.result.payout, 23.4);
  assert.equal(slot.cashOut(balloon), false);

  const late = activeBet(1.5);
  late.at(timeFor(1.6));
  assert.equal(late.slot.cashOut(late.balloon), false);
  assert.equal(late.slot.status, 'lost');
});

test('golden balloon keeps going past 10x and honours high auto targets', () => {
  const { slot, balloon, at } = activeBet(1000, { golden: true, auto: 50 });
  at(balloon.timeFor(20)); // real time, including the long-flight speed-up
  assert.equal(slot.status, 'active');
  assert.ok(balloon.multiplier > 10);
  at(balloon.timeFor(50));
  assert.deepEqual(slot.result, { won: true, multiplier: 50, payout: 500, auto: true, capped: false });
});

test('golden balloon pops at the same multiplier a normal one would, just sooner', () => {
  const { balloon, slot, at } = activeBet(2, { golden: true });
  at(timeFor(2, C.GOLDEN_SPEED) - 1);
  assert.equal(slot.status, 'active');
  at(timeFor(2, C.GOLDEN_SPEED));
  assert.equal(slot.status, 'lost');
  assert.equal(balloon.multiplier, 2);
  assert.ok(timeFor(2, C.GOLDEN_SPEED) < timeFor(2));
});

test('clear() resets a settled bet for the next round', () => {
  const { slot, at } = activeBet(1);
  at(0);
  assert.equal(slot.status, 'lost');
  slot.clear();
  assert.equal(slot.status, 'none');
});
