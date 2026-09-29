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

test('golden return at the best target matches k · goldenFactor(), and higher targets cannot beat it', () => {
  const expected = BF.outcome.survivalConstant(C.RTP) * BF.outcome.goldenFactor();
  const r = rtpFor(true, BF.outcome.goldenBestTarget(), N);
  assert.ok(Math.abs(r - expected) < 0.05, `golden at cap: ${r}, expected ${expected}`);
  assert.ok(rtpFor(true, 1000, N) < expected + 0.05);
});

test('best possible overall return matches every operator RTP setting', () => {
  for (const rtp of C.RTP_OPTIONS) {
    const r = blended(N * 4, 2, C.GOLDEN_CAP, rtp);
    assert.ok(Math.abs(r - rtp) < 0.012, `setting ${rtp}: simulated ${r}`);
    assert.ok(r < 1, 'house always keeps an edge');
  }
});
