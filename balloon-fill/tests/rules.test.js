const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./load');

const BF = loadGame();
const C = BF.CONFIG;

test('rules quote the configured RTP and limits', () => {
  for (const rtp of C.RTP_OPTIONS) {
    const html = BF.rules.html(rtp);
    assert.ok(html.includes(`${(rtp * 100).toFixed(2)}%`), `RTP ${rtp} missing`);
    assert.ok(html.includes('same chance to pop'));
    assert.ok(html.includes(C.MAX_MULTIPLIER.toLocaleString('en-US')));
    assert.ok(html.includes('Malfunction voids all pays and plays'));
  }
});

test('rules figures agree with the odds model', () => {
  const f = BF.rules.figures(0.97);
  assert.equal(f.k, 0.97); // every target on every balloon returns the RTP
  assert.ok(f.min < f.k);
  assert.ok(Math.abs(f.instant - (1 - f.min)) < 1e-12);
});
