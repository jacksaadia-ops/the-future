#!/usr/bin/env node
/**
 * Monte Carlo payout simulation for Balloon Fill.
 *
 *   node tools/simulate.js [rounds]
 *
 * For each operator RTP setting, prints the return (total paid / total bet)
 * of normal and golden balloons at several auto cash-out targets, and the
 * overall return for a player who holds golden balloons to the cap (the best
 * possible strategy) — which should equal the configured RTP.
 */
const { loadGame } = require('../tests/load');

const BF = loadGame();
const C = BF.CONFIG;
const { samplePopPoint, survivalConstant, buildBalloon } = BF.outcome;

/** Multiplier won by an auto cash-out at `target` on one balloon (0 if it popped). */
function payoutFor(balloon, target) {
  const b = new BF.SharedBalloon(0, balloon);
  const effective = Math.min(target, b.maxMultiplier);
  return b.timeFor(effective) <= b.endTimeMs + 1e-9 ? effective : 0;
}

function randomBalloon(golden, rtp) {
  return buildBalloon(samplePopPoint(Math.random(), survivalConstant(rtp)), golden);
}

/** Return of flat bets on one balloon type at a fixed target. */
function rtpFor(golden, target, n, rtp = C.RTP) {
  let paid = 0;
  for (let i = 0; i < n; i++) paid += payoutFor(randomBalloon(golden, rtp), target);
  return paid / n;
}

/**
 * Overall return with real golden odds. The player can't know in advance
 * whether a balloon is golden, but once it is revealed they may use a
 * different target (goldenTarget) for it.
 */
function blended(n, normalTarget, goldenTarget, rtp = C.RTP) {
  let paid = 0;
  for (let i = 0; i < n; i++) {
    const golden = Math.random() < C.GOLDEN_CHANCE;
    paid += payoutFor(randomBalloon(golden, rtp), golden ? goldenTarget : normalTarget);
  }
  return paid / n;
}

module.exports = { payoutFor, rtpFor, blended };

if (require.main === module) {
  const n = Number(process.argv[2]) || 1000000;
  const pct = (x) => `${(x * 100).toFixed(2)}%`.padStart(8);
  const targets = [1.5, 2, 5, 10];

  console.log(`Balloon Fill payout simulation — ${n.toLocaleString()} balloons per figure`);
  console.log(`Golden: ${C.GOLDEN_CHANCE * 100}% chance per balloon, ${C.GOLDEN_SPEED}x speed, pays ${C.GOLDEN_CAP}x at the cap\n`);

  for (const rtp of C.RTP_OPTIONS) {
    const k = survivalConstant(rtp);
    console.log(`RTP setting ${BF.util.rtp(rtp)}  (normal balloons return ${(k * 100).toFixed(2)}%, instant-pop rate ${((1 - k / 1.01) * 100).toFixed(2)}%)`);
    console.log('  Target    Normal    Golden');
    for (const t of targets) {
      console.log(`  ${(t.toFixed(2) + 'x').padEnd(8)}${pct(rtpFor(false, t, n, rtp))}  ${pct(rtpFor(true, t, n / 4, rtp))}`);
    }
    console.log(`  Overall, 2x target, golden held to cap: ${pct(blended(n * 2, 2, C.GOLDEN_CAP, rtp))}  (theory ${pct(rtp)})\n`);
  }
}
