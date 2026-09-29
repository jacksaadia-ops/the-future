const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./load');

const BF = loadGame();
const C = BF.CONFIG;
const { samplePopPoint, buildRound, GoldenSchedule, LocalOutcomeProvider } = BF.outcome;

test('pop point applies the house edge and never drops below 1.00x', () => {
  assert.equal(samplePopPoint(0), 1); // 0.97 → instant pop
  assert.equal(samplePopPoint(0.5), 1.94);
  assert.equal(samplePopPoint(0.99), 97);
  assert.equal(samplePopPoint(1 - 1e-12), C.MAX_MULTIPLIER);
});

test('pop point survival matches (1 - edge) / x', () => {
  const n = 200000;
  let over2 = 0;
  let over10 = 0;
  for (let i = 0; i < n; i++) {
    const p = samplePopPoint(Math.random());
    if (p >= 2) over2++;
    if (p >= 10) over10++;
  }
  assert.ok(Math.abs(over2 / n - 0.485) < 0.01, `P(>=2) was ${over2 / n}`);
  assert.ok(Math.abs(over10 / n - 0.097) < 0.005, `P(>=10) was ${over10 / n}`);
});

test('golden rounds pop at the same moment as normal ones, just grow faster and cap', () => {
  const normal = buildRound(4, false, 'a');
  const golden = buildRound(4, true, 'b');
  assert.equal(golden.popTimeMs, normal.popTimeMs);
  assert.equal(golden.speed, C.GOLDEN_SPEED);
  assert.ok(Math.abs(golden.popMultiplier - 4 ** C.GOLDEN_SPEED) < 1e-9);
  assert.equal(golden.maxMultiplier, C.GOLDEN_CAP);
  assert.equal(buildRound(500, true, 'c').popMultiplier, C.GOLDEN_CAP);
  assert.equal(normal.maxMultiplier, C.MAX_MULTIPLIER);
});

test('exactly one golden per block, at a varying position', () => {
  const schedule = new GoldenSchedule();
  const positions = new Set();
  for (let block = 0; block < 200; block++) {
    let goldens = 0;
    for (let i = 0; i < C.GOLDEN_EVERY; i++) {
      if (schedule.next()) {
        goldens++;
        positions.add(i);
      }
    }
    assert.equal(goldens, 1, `block ${block} had ${goldens} goldens`);
  }
  assert.ok(positions.size > 20, `only ${positions.size} distinct golden positions`);
});

test('golden schedule resumes from saved state and rejects bad state', () => {
  const a = new GoldenSchedule({ index: 10, goldenAt: 12 });
  assert.equal(a.next(), false);
  assert.equal(a.next(), false);
  assert.equal(a.next(), true);
  assert.deepEqual(a.state.index, 13);

  const b = new GoldenSchedule({ index: 99, goldenAt: -1 });
  assert.equal(b.state.index, 0);
  assert.ok(b.state.goldenAt >= 0 && b.state.goldenAt < C.GOLDEN_EVERY);
});

test('provider hands out one golden per block of rounds', async () => {
  const provider = new LocalOutcomeProvider();
  let goldens = 0;
  for (let i = 0; i < C.GOLDEN_EVERY * 4; i++) {
    const round = await provider.createRound();
    if (round.golden) goldens++;
  }
  assert.equal(goldens, 4);
});
