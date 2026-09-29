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
const { survivalConstant, goldenFactor, goldenReturn, goldenBestTarget, samplePopPoint, buildBalloon } = G.outcome;

const N = Number(process.argv[2]) || 10000000;
const pct = (x, d = 3) => `${(x * 100).toFixed(d)}%`;
const fx = (x) => `${x.toFixed(2)}x`;
const oneIn = (p) => (p > 0 ? `1 in ${1 / p < 10 ? (1 / p).toFixed(2) : Math.round(1 / p).toLocaleString('en-US')}` : '—');

/* ---------------- exact theory ---------------- */

/** P(a normal balloon reaches target x), x on the 0.01 grid, x ≥ 1.01. */
const pNormal = (x, k) => Math.min(1, k / x);
/** P(a golden balloon reaches target y ≤ cap). */
const pGolden = (y, k) => goldenReturn(y) * k / Math.min(y, C.GOLDEN_CAP);

function theory(rtp) {
  const k = survivalConstant(rtp);
  const p = C.GOLDEN_CHANCE;
  const gf = goldenFactor();
  return {
    rtp, k, gf,
    instant: 1 - k / 1.01,
    best: k * ((1 - p) + p * gf),
    autoAnyTarget: k * ((1 - p) + p * 1), // lower bound when golden also cashed at a low target
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
  const bestGold = goldenBestTarget();
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
  L(`| RTP settings offered | ${C.RTP_OPTIONS.map((r) => pct(r, 0)).join(', ')} (default ${pct(C.RTP, 0)}) |`);
  L(`| Balloons per round | ${C.BALLOONS}, independent outcomes |`);
  L(`| Multiplier curve | m(t) = e^(${C.GROWTH_RATE} × speed × t), t in ms; normal reaches 2x in ${(Math.log(2) / C.GROWTH_RATE / 1000).toFixed(2)} s |`);
  L(`| Multiplier resolution | 0.01 (pop points, auto cash-out targets and manual cash-outs are whole cents; manual cash-outs round down) |`);
  L(`| Maximum multiplier | ${C.MAX_MULTIPLIER.toLocaleString('en-US')}x (balloon pays out at this value if it survives) |`);
  L(`| Golden chance | ${pct(C.GOLDEN_CHANCE, 2)} per balloon, independent, revealed only after bets lock |`);
  L(`| Golden speed | ${C.GOLDEN_SPEED}× (pops at the same moment it otherwise would) |`);
  L(`| Golden cap | ${fx(C.GOLDEN_CAP)} (paid automatically to every bet still in) |`);
  L(`| Bet limits | ${C.MIN_BET.toFixed(2)} – ${C.MAX_BET.toLocaleString('en-US')} per balloon |`);
  L(`| Round timing | betting ${C.BETTING_MS / 1000} s, lock/reveal ${C.REVEAL_MS / 1000} s, results ${C.ROUND_END_MS / 1000} s |`);
  L('| Random source | Provably fair: SHA-256(serverSeed : clientSeed1 : clientSeed2 : clientSeed3 : balloonIndex); first 52 bits → pop point, next 52 bits → golden. Server seed from a CSPRNG, committed by its SHA-256 before betting opens. Runs client-side in this build. |');
  L();

  L('## 3. Mathematical model');
  L();
  L('For each balloon a uniform U in [0, 1) — the first 52 bits of the balloon\'s provably-fair hash — is converted to a normal-curve pop point:');
  L();
  L('    P = max(1.00, floor_to_cent( k / (1 − U) ))       capped at the maximum multiplier');
  L();
  L('so for any target x on the 0.01 grid (x ≥ 1.01):  **P(balloon reaches x) = k / x**, and cashing out at x returns');
  L('**x · k / x = k** regardless of x. Pop points below 1.01x pop instantly (rate 1 − k/1.01).');
  L();
  L(`A golden balloon uses the same pop *time* but grows ${C.GOLDEN_SPEED}× faster, so it reaches y exactly when the`);
  L(`normal pop point is ≥ y^(1/${C.GOLDEN_SPEED}). Its return at target y ≤ cap is k · y / ceil_to_cent(y^(1/${C.GOLDEN_SPEED})).`);
  L(`The best golden target is **${fx(bestGold)}**, returning k × ${goldenFactor().toFixed(5)}`);
  L(`(holding to the ${fx(C.GOLDEN_CAP)} cap returns k × ${goldenReturn(C.GOLDEN_CAP).toFixed(5)}; the continuous approximation is ${(C.GOLDEN_CAP ** (1 - 1 / C.GOLDEN_SPEED)).toFixed(5)}).`);
  L();
  L('k is set from the operator RTP so that best-possible play returns exactly the configured RTP (GLI-19 §4.7.1 measures');
  L('minimum RTP using the strategy with the greatest return):');
  L();
  L(`    RTP = k · [ (1 − ${C.GOLDEN_CHANCE}) + ${C.GOLDEN_CHANCE} · ${goldenFactor().toFixed(5)} ]`);
  L();

  L('## 4. RTP by setting');
  L();
  L('| RTP setting | k (normal balloon return) | Instant-pop rate | Best play (theory) | Best play (simulated, 95% CI) | Lowest possible play |');
  L('| --- | --- | --- | --- | --- | --- |');
  for (const rtp of C.RTP_OPTIONS) {
    const t = theory(rtp);
    const s = simulate(rtp, N, 2, bestGold);
    L(`| ${pct(rtp, 0)} | ${pct(t.k)} | ${pct(t.instant)} | ${pct(t.best, 4)} | ${pct(s.mean)} ± ${pct(s.ci)} | ${pct(t.min)} |`);
  }
  L();
  L('- **Best play**: any normal-balloon target (all return k), golden balloons cashed at the best golden target.');
  L('- **Any auto cash-out target**: between k and best play, depending on the golden-balloon target.');
  L('- **Lowest possible play**: manual cash-out at the very start (paid 1.00x after rounding down to the cent) returns k / 1.01.');
  L('  Manual cash-outs in general return between k/1.01 and k because the multiplier is rounded down to the cent.');
  L();

  L(`## 5. Detail for the default ${pct(C.RTP, 0)} setting`);
  L();
  L(`k = ${main.k.toFixed(6)}.`);
  L();
  L('### 5.1 Normal balloon — per cash-out target (bet of 1)');
  L();
  L('| Target | P(win) | Hit frequency | RTP | Std. deviation |');
  L('| --- | --- | --- | --- | --- |');
  for (const x of [1.01, 1.1, 1.25, 1.5, 2, 3, 5, 10, 20, 50, 100, 1000, C.MAX_MULTIPLIER]) {
    const p = pNormal(x, main.k);
    L(`| ${fx(x)} | ${pct(p)} | ${oneIn(p)} | ${pct(x * p)} | ${Math.sqrt(x * x * p - (x * p) ** 2).toFixed(3)} |`);
  }
  L();
  L('### 5.2 Golden balloon — per cash-out target (bet of 1)');
  L();
  L('| Target | P(win) | RTP |');
  L('| --- | --- | --- |');
  const gTargets = [1.5, 2, 3, 5, 7.5, bestGold, C.GOLDEN_CAP].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
  for (const y of gTargets) {
    const p = pGolden(y, main.k);
    const note = y === bestGold ? ' (best)' : y === C.GOLDEN_CAP ? ' (cap)' : '';
    L(`| ${fx(y)}${note} | ${pct(p)} | ${pct(y * p)} |`);
  }
  L();
  L('### 5.3 Pop-point distribution (normal balloon)');
  L();
  L('| Pops before | Probability |');
  L('| --- | --- |');
  for (const x of [1.01, 1.5, 2, 3, 5, 10, 100]) L(`| ${fx(x)} | ${pct(1 - pNormal(x, main.k))} |`);
  L(`| (median pop point) | ${fx(Math.ceil(2 * main.k * 100) / 100)} |`);
  L();
  L('### 5.4 Golden frequency');
  L();
  L(`- Per balloon: ${pct(C.GOLDEN_CHANCE, 2)} (${oneIn(C.GOLDEN_CHANCE)}).`);
  L(`- Per round (at least one of ${C.BALLOONS}): ${pct(1 - (1 - C.GOLDEN_CHANCE) ** C.BALLOONS, 2)}.`);
  L(`- Golden balloon reaching the ${fx(C.GOLDEN_CAP)} cap: ${pct(pGolden(C.GOLDEN_CAP, main.k))} of golden balloons.`);
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
  L(`- Maximum multiplier on a normal balloon: ${C.MAX_MULTIPLIER.toLocaleString('en-US')}x (probability ${pct(pNormal(C.MAX_MULTIPLIER, main.k), 4)} per balloon).`);
  L(`- Maximum single payout at the current bet limit: ${(C.MAX_BET * C.MAX_MULTIPLIER).toLocaleString('en-US')} (bet ${C.MAX_BET.toLocaleString('en-US')} × ${C.MAX_MULTIPLIER.toLocaleString('en-US')}x).`);
  L('- **Recommendation:** add an operator-configurable maximum win per bet (a common requirement for operators),');
  L('  and state it in the game rules. Capping winnings reduces RTP slightly for the highest targets; this report must then be regenerated.');
  L();

  L('## 8. Open items before certification');
  L();
  L('- Move outcome generation, the round clock, bet acceptance and cash-out confirmation to the server; certify the RNG.');
  L('- Provably fair is implemented (server seed committed by hash before betting, first 3 bettors\' client seeds, per-round verification in the game).');
  L('  In production the seeds must be generated and held on the server, and the verification page served from outside the game client.');
  L('- Disconnection: a bet that is locked in must keep running and still honour auto cash-out if the player disconnects.');
  L('  (This client-only build refunds bets that were not yet locked and forfeits bets that were in flight.)');
  L('- Maximum win per bet (see §7), responsible-gambling controls, and jurisdiction-specific disclosures.');
  L();
  return lines.join('\n');
}

const report = build();
const out = path.join(__dirname, '..', 'docs', 'math-report.md');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, report + '\n');
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
