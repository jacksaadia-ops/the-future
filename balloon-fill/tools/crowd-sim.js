#!/usr/bin/env node
/**
 * Operator simulation: a crowd of players over a number of shared rounds,
 * settled with the game's real code (FairRoundProvider → SharedBalloon → BetSlot).
 *
 *   node tools/crowd-sim.js [players=200] [rounds=100] [sessions=1000] [rtp=0.97]
 *
 * Prints one session in detail, then the spread of house profit across many
 * sessions of the same size.
 */
const { loadGame } = require('../tests/load');

const G = loadGame();
const C = G.CONFIG;

const [PLAYERS = 200, ROUNDS = 100, SESSIONS = 1000, RTP = C.RTP] = process.argv.slice(2).map(Number);

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const logRand = (lo, hi) => Math.exp(rand(Math.log(lo), Math.log(hi)));
const money = (v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => `${(v * 100).toFixed(2)}%`;

/* ---------------- player behaviour ---------------- */

const PROFILES = [
  { name: 'casual', share: 0.6, min: 1, max: 20 },
  { name: 'regular', share: 0.3, min: 10, max: 200 },
  { name: 'high roller', share: 0.1, min: 100, max: 5000 },
];

function makePlayers(n) {
  return Array.from({ length: n }, (_, i) => {
    let r = Math.random();
    const profile = PROFILES.find((p) => (r -= p.share) < 0) || PROFILES[0];
    return { id: i, name: `P${i + 1}`, profile, seed: G.fair.newClientSeed() };
  });
}

function pickTarget() {
  const r = Math.random();
  const t = r < 0.45 ? logRand(1.1, 2) : r < 0.8 ? logRand(2, 5) : r < 0.95 ? logRand(5, 20) : logRand(20, 200);
  return Math.round(t * 100) / 100;
}

const pickBet = (p) => Math.max(C.MIN_BET, Math.round(logRand(p.profile.min, p.profile.max)));

/* ---------------- one session ---------------- */

function runSession(players, rounds) {
  const provider = new G.fair.FairRoundProvider({ rtp: RTP });
  const s = {
    bets: 0, wagered: 0, paid: 0, wins: 0, goldens: 0, goldenMaxed: 0,
    biggestPayout: 0, biggestMultiplier: 0, roundsHouseLost: 0,
    byProfile: Object.fromEntries(PROFILES.map((p) => [p.name, { wagered: 0, paid: 0 }])),
  };

  for (let r = 0; r < rounds; r++) {
    provider.commit();
    // Players join in random order; the first three bettors' seeds feed the result.
    const order = players.slice().sort(() => Math.random() - 0.5);
    const bets = [];
    for (const p of order) {
      if (Math.random() > 0.85) continue; // sits this round out
      const both = Math.random() < 0.5;
      const balloons = both ? [0, 1] : [Math.random() < 0.5 ? 0 : 1];
      balloons.forEach((b) => bets.push({ player: p, balloon: b, amount: pickBet(p), target: pickTarget() }));
    }
    const firstSeeds = [];
    for (const bet of bets) {
      if (firstSeeds.length === 3) break;
      if (!firstSeeds.some((x) => x.name === bet.player.name)) firstSeeds.push({ name: bet.player.name, seed: bet.player.seed });
    }
    const round = provider.createRoundSync(firstSeeds);
    const shared = round.balloons.map((o, i) => new G.SharedBalloon(i, o));
    shared.forEach((b) => {
      if (b.golden) { s.goldens++; if (b.maxes) s.goldenMaxed++; }
      b.update(b.endTimeMs); // run each balloon to its end
    });

    let roundWagered = 0;
    let roundPaid = 0;
    for (const bet of bets) {
      const b = shared[bet.balloon];
      // After the golden reveal, half the players on that balloon raise their target to the cap.
      const target = b.golden && Math.random() < 0.5 ? G.CONFIG.GOLDEN_CAP : bet.target;
      const slot = new G.BetSlot(bet.balloon);
      slot.place(bet.amount, target);
      slot.activate();
      slot.resolve(b, b.endTimeMs);
      const payout = slot.status === 'cashed' ? slot.result.payout : 0;

      s.bets++;
      s.wagered += bet.amount;
      s.paid += payout;
      roundWagered += bet.amount;
      roundPaid += payout;
      const prof = s.byProfile[bet.player.profile.name];
      prof.wagered += bet.amount;
      prof.paid += payout;
      if (payout > 0) {
        s.wins++;
        if (payout > s.biggestPayout) { s.biggestPayout = payout; s.biggestMultiplier = slot.result.multiplier; }
      }
    }
    if (roundPaid > roundWagered) s.roundsHouseLost++;
  }
  s.profit = s.wagered - s.paid;
  return s;
}

/* ---------------- report ---------------- */

const players = makePlayers(PLAYERS);
const one = runSession(players, ROUNDS);
const counts = PROFILES.map((p) => `${players.filter((x) => x.profile === p).length} ${p.name}s ($${p.min}–$${p.max.toLocaleString('en-US')})`).join(', ');

console.log(`Balloon Fill crowd simulation — ${PLAYERS} players × ${ROUNDS} rounds, RTP setting ${pct(RTP)}`);
console.log(`Players: ${counts}`);
console.log('');
console.log('ONE SESSION');
console.log(`  Bets placed        ${one.bets.toLocaleString('en-US')}`);
console.log(`  Total wagered      ${money(one.wagered)}`);
console.log(`  Total paid out     ${money(one.paid)}`);
console.log(`  House profit       ${money(one.profit)}  (${pct(one.profit / one.wagered)} of wagers)`);
console.log(`  Winning bets       ${one.wins.toLocaleString('en-US')} (${pct(one.wins / one.bets)})`);
console.log(`  Rounds house lost  ${one.roundsHouseLost} of ${ROUNDS}`);
console.log(`  Golden balloons    ${one.goldens} (${one.goldenMaxed} reached the ${C.GOLDEN_CAP}x cap)`);
console.log(`  Biggest payout     ${money(one.biggestPayout)} at ${one.biggestMultiplier.toFixed(2)}x`);
console.log('  By player type:');
for (const [name, v] of Object.entries(one.byProfile)) {
  console.log(`    ${name.padEnd(12)} wagered ${money(v.wagered).padStart(14)}  paid ${money(v.paid).padStart(14)}  house ${money(v.wagered - v.paid).padStart(13)}`);
}

const results = [];
for (let i = 0; i < SESSIONS; i++) results.push(runSession(players, ROUNDS));
results.sort((a, b) => a.profit - b.profit);
const q = (f) => results[Math.min(results.length - 1, Math.floor(f * results.length))];
const totalW = results.reduce((s, r) => s + r.wagered, 0);
const totalP = results.reduce((s, r) => s + r.paid, 0);
const losing = results.filter((r) => r.profit < 0).length;

console.log('');
console.log(`${SESSIONS.toLocaleString('en-US')} SESSIONS OF THE SAME SIZE (same players, new rounds each time)`);
console.log(`  Average wagered    ${money(totalW / SESSIONS)} per session`);
console.log(`  Average paid out   ${money(totalP / SESSIONS)} per session`);
console.log(`  Average profit     ${money((totalW - totalP) / SESSIONS)} per session  (${pct((totalW - totalP) / totalW)} hold)`);
console.log(`  Profit range       worst ${money(results[0].profit)}, 5th pct ${money(q(0.05).profit)}, median ${money(q(0.5).profit)}, 95th pct ${money(q(0.95).profit)}, best ${money(results[results.length - 1].profit)}`);
console.log(`  Sessions the house lost money: ${losing} of ${SESSIONS} (${pct(losing / SESSIONS)})`);
