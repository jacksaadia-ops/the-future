#!/usr/bin/env node
/**
 * Generates the game's math report (PAR sheet) from the live game code.
 *
 *   node tools/math-report.js [simulatedBalloons]   → writes docs/math-report.md
 *
 * Every theoretical figure is computed exactly from the same functions the game
 * uses (outcome.js / round.js), then checked against a Monte Carlo simulation
 * that runs the real SharedBalloon + BetSlot settlement code.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadGame } = require('../tests/load');

const G = loadGame();
const C = G.CONFIG;
const { survivalConstant, samplePopPoint, buildBalloon } = G.outcome;

const N = Number(process.argv[2]) || 10000000;
const pct = (x, d = 3) => `${(x * 100).toFixed(d)}%`;
const fx = (x) => `${x.toFixed(2)}x`;
const oneIn = (p) => (p > 0 ? `1 in ${1 / p < 10 ? (1 / p).toFixed(2) : Math.round(1 / p).toLocaleString('en-US')}` : '—');

/* ---------------- exact theory ---------------- */

/** P(a balloon, golden or normal, reaches target x), x on the 0.01 grid, x ≥ 1.01. */
const pReach = (x, k) => Math.min(1, k / x);

function theory(rtp) {
  const k = survivalConstant(rtp);
  return {
    rtp, k,
    instant: 1 - k / 1.01,
    best: k,
    min: k / 1.01, // manual cash-out at 1.00x (rounded down to the cent) — the worst possible play
  };
}

/* ---------------- simulation using the real settlement code ---------------- */

function simulate(rtp, n, normalTarget, goldenTarget) {
  const k = survivalConstant(rtp);
  let sum = 0;
  let sumSq = 0;
  let goldens = 0;
  const slot = new G.BetSlot(0);
  for (let i = 0; i < n; i++) {
    const golden = Math.random() < C.GOLDEN_CHANCE;
    if (golden) goldens++;
    const b = new G.SharedBalloon(0, buildBalloon(samplePopPoint(Math.random(), k), golden));
    slot.status = 'none';
    slot.place(1, golden ? goldenTarget : normalTarget);
    slot.activate();
    b.update(b.endTimeMs); // run the balloon to its end
    slot.resolve(b, b.endTimeMs);
    const won = slot.status === 'cashed' ? slot.result.multiplier : 0;
    sum += won;
    sumSq += won * won;
  }
  const mean = sum / n;
  const sd = Math.sqrt(sumSq / n - mean * mean);
  return { mean, ci: 1.96 * sd / Math.sqrt(n), sd, goldens };
}

function roundTiming(n) {
  const provider = new G.outcome.LocalRoundProvider();
  const flights = [];
  for (let i = 0; i < n; i++) {
    const r = provider.createRoundSync();
    const balloons = r.balloons.map((o, j) => new G.SharedBalloon(j, o));
    flights.push(Math.max(...balloons.map((b) => b.endTimeMs)) / 1000);
  }
  flights.sort((a, b) => a - b);
  const fixed = (C.BETTING_MS + C.REVEAL_MS + C.ROUND_END_MS) / 1000;
  const meanFlight = flights.reduce((s, x) => s + x, 0) / n;
  return {
    fixed,
    meanFlight,
    medianFlight: flights[Math.floor(n / 2)],
    p95Flight: flights[Math.floor(n * 0.95)],
    meanRound: fixed + meanFlight,
    roundsPerHour: 3600 / (fixed + meanFlight),
  };
}

/* ---------------- report ---------------- */

function gitInfo() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
    const dirty = execSync("git status --porcelain -- . ':!docs'", { cwd: path.join(__dirname, '..') }).toString().trim();
    return `${sha}${dirty ? ' (with uncommitted changes)' : ''}`;
  } catch (e) {
    return 'unknown';
  }
}

function build() {
  const lines = [];
  const L = (s = '') => lines.push(s);
  const main = theory(C.RTP);
  const timing = roundTiming(200000);

  L('# Balloon Fill — Game Math Report (PAR sheet)');
  L();
  L(`Generated ${new Date().toISOString().slice(0, 10)} by \`tools/math-report.js\` from code version \`${gitInfo()}\`.`);
  L('All theoretical values are computed exactly from the game code; simulated values run the real settlement code.');
  L(`Simulation size: ${N.toLocaleString('en-US')} balloons per RTP setting.`);
  L();
  L('> Draft for internal review and test-lab submission. Not legal advice; RTP rules and disclosure');
  L('> requirements vary by jurisdiction and must be confirmed with the certifying lab.');
  L();

  L('## 1. Game summary');
  L();
  L(`Shared-round multiplier ("crash") game with ${C.BALLOONS} balloons per round. Players bet on one balloon or both during a`);
  L(`${C.BETTING_MS / 1000}-second betting window. Bets then lock, any golden balloon is revealed, and both balloons inflate`);
  L('from 1.00x at the same instant. Each balloon pops at an independent random moment. A bet wins its stake times the');
  L('multiplier at which it is cashed out (manually or by auto cash-out) before its balloon pops; otherwise it loses the stake.');
  L();

  L('## 2. Parameters');
  L();
  L('| Parameter | Value |');
  L('| --- | --- |');
  L(`| RTP settings offered | ${C.RTP_OPTIONS.map(G.util.rtp).join(', ')} (default ${G.util.rtp(C.RTP)}) |`);
  L(`| Balloons per round | ${C.BALLOONS}, independent outcomes |`);
  L(`| Multiplier curve | m(t) = e^(${C.GROWTH_RATE} × speed × t), t in ms; normal reaches 2x in ${(Math.log(2) / C.GROWTH_RATE / 1000).toFixed(2)} s |`);
  L(`| Long-flight speed-up | above ${C.WARP_FROM}x the flight clock runs ${C.WARP_SPEEDUP}× faster (same mapping for every balloon; pop points and payouts unchanged) |`);
  L(`| Auto bet | ${C.AUTO_BET ? `on, up to ${C.AUTO_BET_MAX_ROUNDS} rounds (operator setting)` : 'off (operator setting)'} |`);
  L(`| Multiplier resolution | 0.01 (pop points, auto cash-out targets and manual cash-outs are whole cents; manual cash-outs round down) |`);
  L(`| Manual cash-out | from ${C.MIN_CASHOUT.toFixed(2)}x, so a cash-out always pays more than the stake |`);
  L(`| Settlement | exact: stake (whole cents) × multiplier (0.01x steps) is paid to 1/10,000 dollar and never rounded to the cent (e.g. 0.10 × 1.05x = 0.105), so the cash return equals the multiplier return at every stake |`);
  L(`| Maximum win per bet | ${C.MAX_WIN.toLocaleString('en-US')}, stake included: a bet is cashed out automatically at MAX_WIN ÷ stake if the balloon gets there (RTP unchanged, see §7) |`);
  L(`| Maximum multiplier | ${C.MAX_MULTIPLIER.toLocaleString('en-US')}x (balloon pays out at this value if it survives) |`);
  L(`| Golden chance | ${pct(C.GOLDEN_CHANCE, 2)} per balloon, independent, revealed only after bets lock |`);
  L(`| Golden speed | ${C.GOLDEN_SPEED}× (same pop point and odds as a normal balloon; it gets there sooner) |`);
  L(`| Bet limits | ${C.MIN_BET.toFixed(2)} – ${C.MAX_BET.toLocaleString('en-US')} per balloon |`);
  L(`| Round timing | betting ${C.BETTING_MS / 1000} s, lock/reveal ${C.REVEAL_MS / 1000} s, results ${C.ROUND_END_MS / 1000} s |`);
  L('| Random source | Provably fair: SHA-256(serverSeed : clientSeed1 : clientSeed2 : clientSeed3 : balloonIndex); first 52 bits → pop point, next 52 bits → golden. Server seed from a CSPRNG, committed by its SHA-256 before betting opens. Runs client-side in this build. |');
  L();

  L('## 3. Mathematical model');
  L();
  L('For each balloon a uniform U in [0, 1) — the first 52 bits of the balloon\'s provably-fair hash — is converted to a pop point:');
  L();
  L('    P = max(1.00, floor_to_cent( k / (1 − U) ))       capped at the maximum multiplier');
  L();
  L('so for any target x on the 0.01 grid (x ≥ 1.01):  **P(balloon reaches x) = k / x**, and cashing out at x returns');
  L('**x · k / x = k** regardless of x. Pop points below 1.01x pop instantly (rate 1 − k/1.01).');
  L();
  L(`A golden balloon draws its pop point P exactly the same way, pops at the same multiplier P and has the same maximum;`);
  L(`it only inflates ${C.GOLDEN_SPEED}× faster, so it reaches P sooner. The chance of reaching any multiplier is therefore`);
  L('identical for golden and normal balloons.');
  L();
  L('k is the operator RTP, so every cash-out target on every balloon returns exactly the configured RTP:');
  L();
  L('    k = RTP');
  L();

  L('## 4. RTP by setting');
  L();
  L('| RTP setting | k (return, any target) | Instant-pop rate | Theory | Simulated, 95% CI | Lowest possible play |');
  L('| --- | --- | --- | --- | --- | --- |');
  for (const rtp of C.RTP_OPTIONS) {
    const t = theory(rtp);
    const s = simulate(rtp, N, 2, 5);
    L(`| ${G.util.rtp(rtp)} | ${pct(t.k)} | ${pct(t.instant)} | ${pct(t.best, 4)} | ${pct(s.mean)} ± ${pct(s.ci)} | ${pct(t.min)} |`);
  }
  L();
  L('- **Theory**: every auto cash-out target, on golden and normal balloons, returns k. Simulated with a 2.00x target on normal');
  L('  balloons and a 5.00x target on golden ones.');
  L(`- **Manual cash-outs** open at ${C.MIN_CASHOUT.toFixed(2)}x and are paid the multiplier rounded down to 0.01x, so they return`);
  L('  slightly less than k (at most 1%, at the very first cash-out point); no play returns more than k.');
  L();

  L(`## 5. Detail for the default ${G.util.rtp(C.RTP)} setting`);
  L();
  L(`k = ${main.k.toFixed(6)}.`);
  L();
  L('### 5.1 Per cash-out target (bet of 1, golden or normal balloon)');
  L();
  L('| Target | P(win) | Hit frequency | RTP | Std. deviation |');
  L('| --- | --- | --- | --- | --- |');
  for (const x of [1.01, 1.1, 1.25, 1.5, 2, 3, 5, 10, 20, 50, 100, 1000, C.MAX_MULTIPLIER]) {
    const p = pReach(x, main.k);
    L(`| ${fx(x)} | ${pct(p)} | ${oneIn(p)} | ${pct(x * p)} | ${Math.sqrt(x * x * p - (x * p) ** 2).toFixed(3)} |`);
  }
  L();
  L('Golden balloons follow exactly the same table.');
  L();
  L('### 5.2 Pop-point distribution (golden and normal balloons)');
  L();
  L('| Pops before | Probability |');
  L('| --- | --- |');
  for (const x of [1.01, 1.5, 2, 3, 5, 10, 100]) L(`| ${fx(x)} | ${pct(1 - pReach(x, main.k))} |`);
  L(`| (median pop point) | ${fx(Math.ceil(2 * main.k * 100) / 100)} |`);
  L();
  L('### 5.3 Golden frequency');
  L();
  L(`- Per balloon: ${pct(C.GOLDEN_CHANCE, 2)} (${oneIn(C.GOLDEN_CHANCE)}).`);
  L(`- Per round (at least one of ${C.BALLOONS}): ${pct(1 - (1 - C.GOLDEN_CHANCE) ** C.BALLOONS, 2)}.`);
  L(`- Golden balloon reaching 10.00x: ${pct(pReach(10, main.k))} of golden balloons (the same as a normal balloon).`);
  L('- Golden status is drawn independently for every balloon, so past rounds carry no information about future ones.');
  L();

  L('## 6. Round timing (from 200,000 simulated rounds)');
  L();
  L('| Measure | Value |');
  L('| --- | --- |');
  L(`| Fixed time per round (betting + reveal + results) | ${timing.fixed.toFixed(1)} s |`);
  L(`| Flight time (until both balloons finish) — mean / median / 95th percentile | ${timing.meanFlight.toFixed(1)} s / ${timing.medianFlight.toFixed(1)} s / ${timing.p95Flight.toFixed(1)} s |`);
  L(`| Mean round length | ${timing.meanRound.toFixed(1)} s |`);
  L(`| Rounds per hour | ~${Math.round(timing.roundsPerHour)} |`);
  L();

  L('## 7. Exposure');
  L();
  L(`- Maximum multiplier on a normal balloon: ${C.MAX_MULTIPLIER.toLocaleString('en-US')}x (probability ${pct(pReach(C.MAX_MULTIPLIER, main.k), 4)} per balloon).`);
  L(`- Maximum win per bet: ${C.MAX_WIN.toLocaleString('en-US')} (operator setting \`MAX_WIN\`), stake included. Without it the largest payout would be`);
  L(`  ${(C.MAX_BET * C.MAX_MULTIPLIER).toLocaleString('en-US')} (bet ${C.MAX_BET.toLocaleString('en-US')} × ${C.MAX_MULTIPLIER.toLocaleString('en-US')}x).`);
  L(`- How it is applied: each bet is cashed out automatically at min(auto target, ${C.MAX_WIN.toLocaleString('en-US')} ÷ stake rounded down to 0.01x)`);
  L(`  (e.g. ${Math.floor((C.MAX_WIN / C.MAX_BET) * 100) / 100}x on a ${C.MAX_BET.toLocaleString('en-US')} bet). A cash-out at any multiplier x is reached with probability k / x,`);
  L('  so it returns k: the cap never lowers the RTP, and no payout can exceed the max win.');
  L();

  L('## 8. Open items before certification');
  L();
  L('- Move outcome generation, the round clock, bet acceptance and cash-out confirmation to the server; certify the RNG.');
  L('- Provably fair is implemented (server seed committed by hash before betting, first 3 bettors\' client seeds, per-round verification in the game).');
  L('  In production the seeds must be generated and held on the server, and the verification page served from outside the game client.');
  L('- Disconnection: this build refunds bets that were not yet locked, and settles locked bets when the player returns exactly as the');
  L('  round played out (auto cash-out or max-win cap if reached, otherwise lost). In production this settlement belongs on the server.');
  L('- Responsible-gambling controls and jurisdiction-specific disclosures (e.g. autoplay, round speed) for the chosen market.');
  L();
  return lines.join('\n');
}

const report = build();
const out = path.join(__dirname, '..', 'docs', 'math-report.md');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, report + '\n');
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
