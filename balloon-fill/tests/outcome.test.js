const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./load');

const BF = loadGame();
const C = BF.CONFIG;
const { samplePopPoint, survivalConstant, goldenFactor, buildBalloon, LocalRoundProvider } = BF.outcome;

test('survival constant makes optimal overall return equal the RTP setting', () => {
  for (const rtp of C.RTP_OPTIONS) {
    const k = survivalConstant(rtp);
    const overall = k * ((1 - C.GOLDEN_CHANCE) + C.GOLDEN_CHANCE * goldenFactor());
    assert.ok(Math.abs(overall - rtp) < 1e-12);
    assert.ok(k < rtp, 'normal balloons return a little less than the headline RTP');
  }
});

test('pop point never drops below 1.00x and follows k / x', () => {
  const k = survivalConstant(0.97);
  assert.equal(samplePopPoint(0, k), 1); // k < 1 → instant pop
  assert.equal(samplePopPoint(1 - 1e-12, k), C.MAX_MULTIPLIER);
  const n = 200000;
  let over2 = 0;
  for (let i = 0; i < n; i++) if (samplePopPoint(Math.random(), k) >= 2) over2++;
  assert.ok(Math.abs(over2 / n - k / 2) < 0.01, `P(>=2) was ${over2 / n}, expected ${k / 2}`);
});

test('golden balloons pop at the same moment, grow faster and stop at the cap', () => {
  const normal = buildBalloon(4, false);
  const golden = buildBalloon(4, true);
  assert.equal(golden.popTimeMs, normal.popTimeMs);
  assert.equal(golden.speed, C.GOLDEN_SPEED);
  assert.ok(Math.abs(golden.popMultiplier - 4 ** C.GOLDEN_SPEED) < 1e-9);
  assert.equal(golden.maxMultiplier, C.GOLDEN_CAP);
  assert.equal(buildBalloon(500, true).popMultiplier, C.GOLDEN_CAP);
});

test('each round has one outcome per balloon; golden is independent per balloon', () => {
  const provider = new LocalRoundProvider();
  const n = 60000;
  let goldens = 0;
  let both = 0;
  for (let i = 0; i < n; i++) {
    const r = provider.createRoundSync();
    assert.equal(r.balloons.length, C.BALLOONS);
    const g = r.balloons.filter((b) => b.golden).length;
    goldens += g;
    if (g === 2) both++;
  }
  const rate = goldens / (n * C.BALLOONS);
  assert.ok(Math.abs(rate - C.GOLDEN_CHANCE) < 0.003, `golden rate ${rate}`);
  assert.ok(both < 30, 'both golden should be very rare (~0.01%)');
});

test('golden chance does not depend on history (no pattern to wait for)', () => {
  const provider = new LocalRoundProvider();
  let afterGolden = 0;
  let afterGoldenHits = 0;
  let prevGolden = false;
  for (let i = 0; i < 400000; i++) {
    const g = provider.createRoundSync().balloons[0].golden;
    if (prevGolden) { afterGolden++; if (g) afterGoldenHits++; }
    prevGolden = g;
  }
  // Right after a golden, the next balloon is still ~1% golden.
  assert.ok(afterGoldenHits / afterGolden < 0.04, `${afterGoldenHits}/${afterGolden}`);
});
