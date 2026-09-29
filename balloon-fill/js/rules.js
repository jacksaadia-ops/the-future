/**
 * Player-facing game rules and payout information. Generated from CONFIG and
 * the odds functions in outcome.js, so it always matches the running game.
 */
(function () {
  const C = BF.CONFIG;
  const { money } = BF.util;
  const O = BF.outcome;

  const pct = (x, d = 2) => `${(x * 100).toFixed(d)}%`;
  const fx = (x) => `${x.toFixed(2)}x`;

  /** All the numbers the rules quote, for the configured RTP. */
  function figures(rtp = C.RTP) {
    const k = O.survivalConstant(rtp);
    return {
      rtp,
      k,
      min: k / 1.01,
      instant: 1 - k / 1.01,
      goldenBest: k * O.goldenFactor(),
      goldenBestTarget: O.goldenBestTarget(),
      reach: [1.5, 2, 5, 10, 100].map((x) => ({ x, p: k / x })),
    };
  }

  function html(rtp = C.RTP) {
    const f = figures(rtp);
    return `
      <h3>How to play</h3>
      <ol>
        <li><b>Place your bets.</b> Each round starts with a ${C.BETTING_MS / 1000}-second betting window. Bet on Balloon 1, Balloon 2, or both. Each balloon has its own bet and its own auto cash-out. You can cancel a bet until the window closes.</li>
        <li><b>Bets lock.</b> When the window closes, bets can no longer be placed, changed or cancelled. Any Golden Balloon is revealed at this moment.</li>
        <li><b>The balloons fill.</b> Both balloons start at 1.00x at the same instant and the multiplier rises as they inflate. Each balloon pops at its own random moment.</li>
        <li><b>Cash out before it pops.</b> Cashing out pays your bet times the multiplier at that moment. If the balloon pops first, the bet on that balloon is lost.</li>
      </ol>
      <p>While a round is running you can press <b>Bet Next Round</b> to have a bet placed automatically when the next betting window opens.</p>

      <h3>Cashing out</h3>
      <ul>
        <li><b>Manual:</b> pays the multiplier shown when your cash-out is received, rounded down to the nearest 0.01x.</li>
        <li><b>Auto cash-out:</b> pays exactly your target multiplier if the balloon reaches it. Targets can be set from 1.01x in steps of 0.01x.</li>
        <li>Some balloons pop immediately at 1.00x (${pct(f.instant)} of balloons at this RTP). Bets on those balloons are lost.</li>
      </ul>

      <h3>Golden Balloon</h3>
      <ul>
        <li>Every balloon has an independent ${pct(C.GOLDEN_CHANCE, 0)} chance (1 in ${Math.round(1 / C.GOLDEN_CHANCE)}) of being golden. It is revealed only after bets lock, and past rounds have no effect on the chance.</li>
        <li>A Golden Balloon inflates ${C.GOLDEN_SPEED}× faster but pops at exactly the same moment it would have as a normal balloon, so its multiplier climbs higher before it pops.</li>
        <li>It can pop at any moment, with exactly the same chance as a normal balloon. Most Golden Balloons (about ${Math.round((1 - O.goldenReturn(C.GOLDEN_CAP) * O.survivalConstant(rtp) / C.GOLDEN_CAP) * 100)} in 100) pop before ${fx(C.GOLDEN_CAP)}, and bets still in when it pops are lost.</li>
        <li>${fx(C.GOLDEN_CAP)} is the maximum. If a Golden Balloon gets there without popping, every bet still in is cashed out at ${fx(C.GOLDEN_CAP)} and the balloon floats away.</li>
      </ul>

      <h3>Payouts and odds</h3>
      <table class="rules-table">
        <tr><th>Return to player (RTP)</th><td><b>${pct(f.rtp, 2)}</b></td></tr>
        <tr><th>Normal balloon, any cash-out target</th><td>${pct(f.k)}</td></tr>
        <tr><th>Golden balloon, best target (${fx(f.goldenBestTarget)})</th><td>${pct(f.goldenBest)}</td></tr>
        <tr><th>Lowest possible return (cashing out at 1.00x)</th><td>${pct(f.min)}</td></tr>
        <tr><th>Maximum multiplier</th><td>${C.MAX_MULTIPLIER.toLocaleString('en-US')}x (paid automatically if reached)</td></tr>
        <tr><th>Golden Balloon cap</th><td>${fx(C.GOLDEN_CAP)}</td></tr>
        <tr><th>Bet per balloon</th><td>${money(C.MIN_BET)} – ${money(C.MAX_BET)}</td></tr>
      </table>
      <p class="rules-note">The RTP is the theoretical long-run return using the best possible play: any cash-out target on normal balloons and a ${fx(f.goldenBestTarget)} target on Golden Balloons. Actual results in any session will vary.</p>
      <table class="rules-table">
        <tr><th colspan="2" class="rules-caption">Chance a normal balloon reaches…</th></tr>
        ${f.reach.map((r) => `<tr><th>${fx(r.x)}</th><td>${pct(r.p)} (about 1 in ${(1 / r.p).toFixed(r.p > 0.1 ? 1 : 0)})</td></tr>`).join('')}
      </table>

      <h3>Other rules</h3>
      <ul>
        <li><b>Provably fair:</b> each round's result comes from a server seed that is locked in (by publishing its SHA-256 fingerprint) before betting opens, combined with the client seeds of the first ${BF.fair ? BF.fair.CLIENT_SEEDS : 3} players to bet. After the round the server seed is revealed so anyone can verify the result. Open the shield icon for details.</li>
        <li>Winnings are paid to your balance immediately and shown rounded to the cent.</li>
        <li><b>Disconnection (play-money demo):</b> if you close the page, bets that were not yet locked are refunded; bets on balloons that were filling are lost.</li>
        <li>Malfunction voids all pays and plays.</li>
      </ul>`;
  }

  BF.rules = { figures, html };
})();
