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
        <li><b>The balloons fill.</b> Both balloons start at 1.00x at the same instant and the multiplier rises as they inflate. Each balloon pops at its own random moment. Above ${fx(C.WARP_FROM)} the multiplier climbs ${C.WARP_SPEEDUP}× faster; this only shortens long rounds and does not change the odds.</li>
        <li><b>Cash out before it pops.</b> Cashing out pays your bet times the multiplier at that moment. If the balloon pops first, the bet on that balloon is lost.</li>
      </ol>
      <p>While a round is running you can press <b>Bet Next Round</b> to have a bet placed automatically when the next betting window opens.</p>
      ${C.AUTO_BET ? `<p><b>Auto bet</b> repeats a balloon's bet, with its current amount and auto cash-out, for the number of rounds you choose (up to ${C.AUTO_BET_MAX_ROUNDS}). It stops when the rounds run out, when your balance is too low, when you cancel a bet on that balloon, or when you switch it off.</p>` : ''}

      <h3>Cashing out</h3>
      <ul>
        <li><b>Manual:</b> available from ${fx(C.MIN_CASHOUT)}, so a cash-out always pays more than your bet. It pays the multiplier shown when your cash-out is received, rounded down to the nearest 0.01x.</li>
        <li><b>Auto cash-out:</b> pays exactly your target multiplier if the balloon reaches it. Targets can be set from 1.01x in steps of 0.01x.</li>
        <li>Some balloons pop immediately at 1.00x (${pct(f.instant)} of balloons at this RTP). Bets on those balloons are lost.</li>
      </ul>

      <h3>Golden Balloon</h3>
      <ul>
        <li>Every balloon has an independent ${pct(C.GOLDEN_CHANCE, 0)} chance (1 in ${Math.round(1 / C.GOLDEN_CHANCE)}) of being golden. It is revealed only after bets lock, and past rounds have no effect on the chance.</li>
        <li>A Golden Balloon inflates ${C.GOLDEN_SPEED}× faster, so the round moves quicker.</li>
        <li>It has exactly the same chance to pop as a normal balloon at every multiplier, and the same ${C.MAX_MULTIPLIER.toLocaleString('en-US')}x maximum. Only the speed is different. Bets still in when it pops are lost.</li>
      </ul>

      <h3>Payouts and odds</h3>
      <table class="rules-table">
        <tr><th>Return to player (RTP)</th><td><b>${pct(f.rtp, 2)}</b></td></tr>
        <tr><th>Any balloon, any cash-out target</th><td>${pct(f.k)}</td></tr>
        <tr><th>Maximum multiplier</th><td>${C.MAX_MULTIPLIER.toLocaleString('en-US')}x (paid automatically if reached)</td></tr>
        <tr><th>Maximum win per bet</th><td>${money(C.MAX_WIN)}, stake included. A bet is cashed out automatically at ${money(C.MAX_WIN)} ÷ stake (e.g. ${fx(Math.floor((C.MAX_WIN / C.MAX_BET) * 100) / 100)} on a ${money(C.MAX_BET)} bet) if the balloon gets there. Cashing out never lowers the RTP.</td></tr>
        <tr><th>Bet per balloon</th><td>${money(C.MIN_BET)} – ${money(C.MAX_BET)}</td></tr>
      </table>
      <p class="rules-note">The RTP is the theoretical long-run return. It is the same for every cash-out target and for golden and normal balloons. Actual results in any session will vary.</p>
      <table class="rules-table">
        <tr><th colspan="2" class="rules-caption">Chance a balloon (golden or normal) reaches…</th></tr>
        ${f.reach.map((r) => `<tr><th>${fx(r.x)}</th><td>${pct(r.p)} (about 1 in ${(1 / r.p).toFixed(r.p > 0.1 ? 1 : 0)})</td></tr>`).join('')}
      </table>

      <h3>Other rules</h3>
      <ul>
        <li><b>Provably fair:</b> each round's result comes from a server seed that is locked in (by publishing its SHA-256 fingerprint) before betting opens, combined with the client seeds of the first ${BF.fair ? BF.fair.CLIENT_SEEDS : 3} players to bet. After the round the server seed is revealed so anyone can verify the result. Open the shield icon for details.</li>
        <li>Winnings are paid to your balance immediately and exactly: stake × multiplier is never rounded to the cent (e.g. $0.10 × 1.05x pays $0.105).</li>
        <li><b>Disconnection:</b> if you close the page, bets that were not yet locked are refunded. Locked bets are settled when you come back, exactly as the round played out: an auto cash-out (or the max win) pays if the balloon reached it; otherwise the bet was still in when it popped and is lost.</li>
        <li>The Demo Feed's other players are simulated to show how the game looks with a crowd. Your own bets in it are real.</li>
        <li>Malfunction voids all pays and plays.</li>
      </ul>`;
  }

  /** Short step-by-step guide for new players (the full rules are in html()). */
  function howTo() {
    const steps = [
      ['Pick your balloon', 'Two balloons fly every round. Bet on Balloon 1, Balloon 2, or both. Each has its own bet box.'],
      ['Bet before the timer ends', `Set an amount (½ and 2× adjust it) and press Place Bet, or Bet on Both. You have ${C.BETTING_MS / 1000} seconds; you can cancel until bets lock.`],
      ['Watch them fill', 'Both balloons start at 1.00x and the multiplier rises as they inflate. Each one pops at its own random moment.'],
      ['Cash out before it pops', 'Press Cash Out to win your bet × the current multiplier. If the balloon pops first, that bet is lost.'],
      ['Set auto cash-out (optional)', 'Type a target like 2.00x and the game cashes out for you the moment the balloon reaches it.'],
    ];
    return `
      <ol class="howto-steps">${steps.map(([t, d], i) => `<li><span class="howto-num">${i + 1}</span><div><b>${t}</b><p>${d}</p></div></li>`).join('')}</ol>
      <p class="howto-tip"><b>Golden Balloon</b> About 1 in ${Math.round(1 / C.GOLDEN_CHANCE)} balloons turns gold after bets lock. It fills ${C.GOLDEN_SPEED}× faster with exactly the same chance to pop.</p>
      <div class="howto-actions">
        <button class="btn-secondary" type="button" data-open-rules>Full rules &amp; payouts</button>
        <button class="btn-primary" type="button" data-close>Got it, let's play</button>
      </div>
      <p class="muted">Keys: Space = main button · 1 / 2 = bet or cash out a balloon.</p>`;
  }

  BF.rules = { figures, html, howTo };
})();
