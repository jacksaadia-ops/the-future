#!/usr/bin/env node
/**
 * Monte Carlo payout simulation for Balloon Fill.
 *
 *   node tools/simulate.js [rounds]
 *
 * Prints return-to-player (RTP = total paid / total bet) for normal and golden
 * balloons at several auto cash-out targets, the blended RTP including one
 * golden per GOLDEN_EVERY rounds, and the "counting" strategy that exploits a
 * per-player golden schedule.
 */
const { loadGame } = require('../tests/load');

const BF = loadGame();
const C = BF.CONFIG;
const { samplePopPoint, buildRound, GoldenSchedule } = BF.outcome;

/** Multiplier won by an auto cash-out at `target` for one round (0 if it popped). */
function payoutFor(round, target) {
  const effective = Math.min(target, round.maxMultiplier);
  const reached = Math.exp(C.GROWTH_RATE * round.speed * round.popTimeMs); // uncapped
  return effective <= reached + 1e-9 ? effective : 0;
}

function randomRound(golden) {
  return buildRound(samplePopPoint(Math.random()), golden, 'sim');
}

/** RTP of flat bets on one balloon type. */
function rtp(golden, target, n) {
  let paid = 0;
  for (let i = 0; i < n; i++) paid += payoutFor(randomRound(golden), target);
  return paid / n;
}

/**
 * Blended RTP over the real golden schedule.
 * normalTarget / goldenTarget: auto cash-out used on each kind of balloon
 * betFor(schedulePosition, goldenSeenInBlock) → bet size (lets us model the counting exploit).
 */
function blended(n, normalTarget, goldenTarget, betFor = () => 1) {
  const schedule = new GoldenSchedule();
  let bet = 0;
  let paid = 0;
  let seen = false;
  for (let i = 0; i < n; i++) {
    const pos = schedule.index;
    if (pos === 0) seen = false;
    const b = betFor(pos, seen);
    const golden = schedule.next();
    if (golden) seen = true;
    bet += b;
    paid += b * payoutFor(randomRound(golden), golden ? goldenTarget : normalTarget);
  }
  return paid / bet;
}

module.exports = { payoutFor, rtp, blended };

if (require.main === module) {
  const n = Number(process.argv[2]) || 1000000;
  const pct = (x) => `${(x * 100).toFixed(2)}%`.padStart(8);
  const targets = [1.01, 1.5, 2, 3, 5, 10, 50];

  console.log(`Balloon Fill RTP simulation — ${n.toLocaleString()} rounds per line`);
  console.log(`Golden: ${C.GOLDEN_SPEED}x speed, cap ${C.GOLDEN_CAP}x, 1 per ${C.GOLDEN_EVERY} rounds; house edge ${C.HOUSE_EDGE * 100}%\n`);
  console.log('Target    Normal    Golden');
  for (const t of targets) {
    console.log(`${(t.toFixed(2) + 'x').padEnd(8)}${pct(rtp(false, t, n))}  ${pct(rtp(true, t, n))}`);
  }

  console.log('\nBlended RTP, flat bets (one golden per block):');
  for (const t of [1.5, 2, 5]) {
    console.log(`  normal ${t}x, golden held to cap: ${pct(blended(n, t, C.GOLDEN_CAP))}`);
  }

  // Exploit: bet 1 normally, 100 on the last round of a block that hasn't had its golden yet.
  const counting = blended(n * 5, 2, C.GOLDEN_CAP, (pos, seen) => (pos === C.GOLDEN_EVERY - 1 && !seen ? 100 : 1));
  console.log(`\nCounting exploit (bet 1, or 100 on a guaranteed golden): ${pct(counting)}`);
  console.log('  → the golden schedule must be server-side/global before real money is involved.');
}
