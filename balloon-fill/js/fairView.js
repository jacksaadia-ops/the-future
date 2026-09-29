/**
 * HTML for the Provably Fair dialog: an overview (how it works, current and
 * next server-seed hashes, your client seed, recent rounds) and a per-round
 * verification view that recomputes every step with BF.fair.verify().
 */
(function () {
  const C = BF.CONFIG;
  const F = BF.fair;
  const { mult } = BF.util;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const code = (s) => `<code class="fair-code">${esc(s)}</code>`;
  const shield = `<svg class="fair-shield" viewBox="0 0 48 56" aria-hidden="true"><path d="M24 2 44 10v16c0 13-8.6 23.6-20 28C12.6 49.6 4 39 4 26V10z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><path d="m15 28 7 7 12-14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function resultCell(f) {
    if (!f) return '—';
    const cls = f.golden ? 'gold' : f.multiplier >= 2 ? 'win' : 'lose';
    return `<span class="hchip ${cls}">${mult(Math.floor(f.multiplier * 100 + 1e-9) / 100)}</span>`;
  }

  /** state: { clientSeed, commitment, nextHash, phase, roundNo, history } */
  function overview(state) {
    const { commitment } = state;
    const rows = state.history.slice(0, 10).map((h) => `
      <tr>
        <td>#${h.roundNo}</td>
        ${h.finals.map((f) => `<td>${resultCell(f)}</td>`).join('')}
        <td><button type="button" class="fair-link" data-verify-round="${h.roundNo}">Verify</button></td>
      </tr>`).join('');

    return `
      <div class="fair-hero">${shield}<div><b>Provably Fair</b><span>Every round can be checked by anyone.</span></div></div>

      <h3>How it works</h3>
      <ol>
        <li><b>Before betting opens</b>, the game picks a secret random <i>server seed</i> and shows its SHA-256 fingerprint (below). The fingerprint locks the seed in: it can't be changed later without the fingerprint changing.</li>
        <li><b>The first ${F.CLIENT_SEEDS} players to bet</b> in the round each add their own <i>client seed</i>, so the result isn't chosen by the game alone.</li>
        <li><b>When bets lock</b>, the seeds are joined and hashed with SHA-256, once per balloon. The hash sets that balloon's pop point and whether it's golden.</li>
        <li><b>After the round</b>, the server seed is revealed. Anyone can check it matches the fingerprint and recompute the result.</li>
      </ol>
      <div class="fair-diagram" aria-hidden="true">
        <span>Server seed</span><i>+</i><span>Seed 1</span><i>+</i><span>Seed 2</span><i>+</i><span>Seed 3</span>
        <i class="arrow">→</i><span class="hl">SHA-256 per balloon</span><i class="arrow">→</i><span class="hl">Pop point &amp; golden</span>
      </div>

      <h3>Current and next round</h3>
      <div class="fair-kv">
        <div><label>Round #${state.roundNo} server seed fingerprint (SHA-256) — ${{
          betting: 'locked in; bets are open',
          reveal: 'bets locked; seed revealed when the round ends',
          flying: 'seed revealed when the round ends',
          ended: 'round over; seed revealed below',
        }[state.phase] || ''}</label>${commitment ? code(commitment.serverSeedHash) : '—'}</div>
        <div><label>Next round server seed fingerprint (SHA-256)</label>${code(state.nextHash)}</div>
      </div>

      <h3>Your client seed</h3>
      <div class="fair-seed">
        <input id="fair-seed-input" type="text" maxlength="32" spellcheck="false" autocomplete="off" value="${esc(state.clientSeed)}" aria-label="Your client seed" />
        <button type="button" class="mini-btn" data-fair-random>Randomize</button>
        <button type="button" class="mini-btn primary" data-fair-save>Save</button>
      </div>
      <p class="rules-note">Your seed is used whenever you are one of the first ${F.CLIENT_SEEDS} players to bet in a round. Letters and numbers only.</p>

      <h3>Recent rounds</h3>
      ${rows ? `<table class="rules-table fair-table"><tr><th>Round</th>${Array.from({ length: C.BALLOONS }, (_, i) => `<th>Balloon ${i + 1}</th>`).join('')}<th></th></tr>${rows}</table>`
        : '<p class="rules-note">Finished rounds will appear here.</p>'}

      <p class="rules-note">To check a hash yourself on a computer: <code class="fair-code inline">printf '%s' "&lt;input&gt;" | sha256sum</code>.
      In this play-money build the game server is simulated inside your browser; in the real-money version seeds are held on the server until each round ends.</p>`;
  }

  /** Detailed, recomputed proof for one finished round. */
  function round(proof) {
    const check = F.verify(proof);
    const k = BF.outcome.survivalConstant(proof.rtp);
    const badge = check.ok
      ? '<span class="fair-badge ok">✓ Verified</span>'
      : '<span class="fair-badge bad">✗ Verification failed</span>';

    const balloons = check.steps.map((s, i) => {
      const f = proof.finals[i];
      return `
        <div class="fair-balloon">
          <h4>Balloon ${i + 1} ${resultCell(f)}${s.golden ? ' <span class="gold-tag">GOLD</span>' : ''}</h4>
          <div class="fair-kv">
            <div><label>Input</label>${code(s.input)}</div>
            <div><label>SHA-256 of input</label><code class="fair-code"><b>${s.hash.slice(0, 13)}</b><u>${s.hash.slice(13, 26)}</u>${s.hash.slice(26)}</code></div>
          </div>
          <table class="rules-table">
            <tr><th>Pop value: first 13 hex digits ÷ 2<sup>52</sup></th><td>${s.u.toFixed(8)}</td></tr>
            <tr><th>Pop point: ${k.toFixed(6)} ÷ (1 − ${s.u.toFixed(6)}), rounded down to 0.01, min 1.00</th><td>${mult(s.popPoint)}</td></tr>
            <tr><th>Golden value: next 13 hex digits ÷ 2<sup>52</sup> (golden if below ${C.GOLDEN_CHANCE})</th><td>${s.g.toFixed(8)} → ${s.golden ? 'golden' : 'normal'}</td></tr>
            ${s.golden ? `<tr><th>Golden multiplier: ${mult(s.popPoint)}<sup>${C.GOLDEN_SPEED}</sup>, capped at ${mult(C.GOLDEN_CAP)}</th><td>${mult(Math.floor(s.finalMultiplier * 100 + 1e-9) / 100)}</td></tr>` : ''}
          </table>
        </div>`;
    }).join('');

    return `
      <button type="button" class="fair-link back" data-fair-back>← All rounds</button>
      <div class="fair-hero">${shield}<div><b>Round #${proof.roundNo}</b>${badge}</div></div>

      <h3>Server seed</h3>
      <div class="fair-kv">
        <div><label>Revealed server seed</label>${code(proof.serverSeed)}</div>
        <div><label>SHA-256 of server seed ${check.hashOk ? '— matches the fingerprint shown before the round ✓' : '— DOES NOT MATCH ✗'}</label>${code(proof.serverSeedHash)}</div>
      </div>

      <h3>Client seeds (first ${F.CLIENT_SEEDS} bettors)</h3>
      ${proof.clientSeeds.length
        ? `<table class="rules-table">${proof.clientSeeds.map((c, i) => `<tr><th>${i + 1}. ${esc(c.name)}</th><td>${code(c.seed)}</td></tr>`).join('')}</table>`
        : '<p class="rules-note">Nobody bet in this round, so only the server seed was used.</p>'}

      <h3>Result</h3>
      <p class="rules-note">RTP setting ${(proof.rtp * 100).toFixed(0)}% (k = ${k.toFixed(6)}). Each balloon hashes the seeds joined with ":" plus its index.</p>
      ${balloons}`;
  }

  BF.fairView = { overview, round };
})();
