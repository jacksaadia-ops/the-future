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

test('payouts are exact: $0.10 cashed at 1.05x pays $0.105, and the wallet keeps it', () => {
  const { slot, events, at } = activeBet(3, { amount: 0.1, auto: 1.05 });
  at(timeFor(1.06));
  assert.equal(slot.status, 'cashed');
  assert.equal(events[0][1].payout, 0.105);
  const w = new BF.Wallet(1);
  w.debit(0.1);
  w.credit(0.105);
  assert.equal(w.balance, 1.005);
});

test('manual cash-out opens at 1.01x, so it always pays more than the stake', () => {
  const { balloon, slot, at } = activeBet(50, { amount: 10 });
  at(timeFor(1.005));
  assert.equal(slot.canCashOut(balloon), false);
  assert.equal(slot.cashOut(balloon), false);
  at(timeFor(1.02));
  assert.equal(slot.canCashOut(balloon), true);
  assert.equal(slot.cashOut(balloon), true);
  assert.ok(slot.result.payout > 10);
});

test('max win: a big bet is cashed out at MAX_WIN ÷ stake when the balloon gets there', () => {
  const { slot, events, at } = activeBet(500, { amount: 10000, auto: 100 });
  assert.equal(slot.winCap(), 25);
  at(timeFor(30));
  assert.equal(slot.status, 'cashed');
  assert.equal(events[0][1].multiplier, 25);
  assert.equal(events[0][1].payout, C.MAX_WIN);
  assert.equal(events[0][1].capped, true);
  const low = activeBet(500, { amount: 10000, auto: 2 });
  low.at(timeFor(3));
  assert.equal(low.events[0][1].multiplier, 2, 'a lower auto target is untouched');
  assert.equal(low.events[0][1].capped, false);
  const manual = activeBet(500, { amount: 10000 });
  manual.at(timeFor(24));
  manual.slot.cashOut(manual.balloon);
  assert.ok(manual.slot.result.payout <= C.MAX_WIN);
});
