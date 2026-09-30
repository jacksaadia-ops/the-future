const test = require('node:test');
const assert = require('node:assert/strict');
const { rtpFor, blended } = require('../tools/simulate');
const { loadGame } = require('./load');

const BF = loadGame();
const C = BF.CONFIG;
const N = 300000;

test('normal balloons return k at any target', () => {
  const k = BF.outcome.survivalConstant(C.RTP);
  for (const target of [1.5, 2, 5]) {
    const r = rtpFor(false, target, N);
    assert.ok(Math.abs(r - k) < 0.02, `target ${target}: ${r} vs ${k}`);
  }
});

test('golden balloons return the same k at every target, including the cap and above', () => {
  const k = BF.outcome.survivalConstant(C.RTP);
  for (const target of [2, 5, 9.99, C.GOLDEN_CAP, 1000]) {
    const r = rtpFor(true, target, N);
    assert.ok(Math.abs(r - k) < 0.03, `golden target ${target}: ${r} vs ${k}`);
  }
});

test('a golden balloon reaches 10x exactly as often as a normal one (k / 10)', () => {
  const k = BF.outcome.survivalConstant(C.RTP);
  const n = 400000;
  let g = 0;
  let nn = 0;
  for (let i = 0; i < n; i++) {
    const p = BF.outcome.samplePopPoint(Math.random(), k);
    const gold = new BF.SharedBalloon(0, BF.outcome.buildBalloon(p, true));
    const norm = new BF.SharedBalloon(0, BF.outcome.buildBalloon(p, false));
    if (gold.timeFor(10) <= gold.endTimeMs + 1e-9) g++;
    if (norm.timeFor(10) <= norm.endTimeMs + 1e-9) nn++;
  }
  assert.equal(g, nn, 'same pop point → same result at 10x');
  assert.ok(Math.abs(g / n - k / 10) < 0.003, `P(golden reaches 10x) = ${g / n}, expected ${k / 10}`);
});

test('overall return matches every operator RTP setting', () => {
  for (const rtp of C.RTP_OPTIONS) {
    const r = blended(N * 4, 2, C.GOLDEN_CAP, rtp);
    assert.ok(Math.abs(r - rtp) < 0.012, `setting ${rtp}: simulated ${r}`);
    assert.ok(r < 1, 'house always keeps an edge');
  }
});
