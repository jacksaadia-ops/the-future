/**
 * Game controller — wires logic (BalloonSlot, Wallet, Progress, outcome
 * provider) to views (BalloonView, feed, progress, skins) and runs the loop.
 */
(function () {
  const C = BF.CONFIG;
  const { $, money, mult, clamp, round2 } = BF.util;

  class Game {
    constructor() {
      const saved = BF.storage.load();

      this.provider = new BF.outcome.LocalOutcomeProvider();
      this.wallet = new BF.Wallet(saved.balance !== undefined ? saved.balance : C.STARTING_BALANCE);
      this.progress = new BF.Progress(saved.progress);
      this.streak = saved.streak || 0;
      this.bestStreak = saved.bestStreak || 0;
      this.equipped = saved.equipped || ['neon-pink', 'electric-blue'];
      this.pending = new Set(); // slots waiting on the outcome provider
      this.displayBalance = this.wallet.balance;

      BF.sound.setEnabled(saved.sound !== false);
      this.particles = new BF.ParticleSystem($('#fx-canvas'));

      const mount = $('#balloons');
      const settings = saved.settings || [];
      this.slots = [0, 1].map((i) => new BF.BalloonSlot(i));
      this.views = this.slots.map((slot, i) => new BF.BalloonView(slot, mount, {
        bet: settings[i] ? settings[i].bet : C.DEFAULT_BETS[i],
        auto: settings[i] ? settings[i].auto : C.DEFAULT_AUTO[i],
        autoOn: settings[i] ? settings[i].autoOn : false,
        skin: this.skinFor(i),
      }));

      this.feed = new BF.LiveFeed($('#feed-list'), $('#online-count'), C.FEED_MAX_ITEMS);
      new BF.LiveFeedSimulator(this.feed).start();

      this.bindSlots();
      this.bindUI();
      this.bindProgress();
      this.renderProgress();
      this.renderSkins();
      this.renderStreak();
      this.renderSoundBtn();
      $('#balance-value').textContent = money(this.wallet.balance);

      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
      // Keeps rounds resolving (auto cash-outs, pops) while the tab is in the background.
      setInterval(() => this.slots.forEach((s) => s.update(performance.now())), 250);
    }

    skinFor(i) {
      const skin = BF.skinById(this.equipped[i]);
      return this.progress.isUnlocked(skin) ? skin : BF.SKINS[i];
    }

    /* ================= gameplay ================= */

    bindSlots() {
      this.slots.forEach((slot, i) => {
        const view = this.views[i];

        slot.on('start', ({ golden }) => {
          view.onStart(golden);
          BF.sound.play('start');
          BF.sound.startInflate(slot.id);
          if (golden) {
            BF.sound.play('golden');
            this.toast(`★ Balloon ${i + 1} is a Golden Balloon — 2× inflation speed!`, 'gold');
          }
        });

        slot.on('cashout', (res) => {
          BF.sound.stopInflate(slot.id);
          BF.sound.play('cashout');
          const c = view.center;
          view.onCashout(res);
          this.particles.cashout(c.x, c.y, slot.golden);
          if (res.multiplier >= 10) this.particles.confetti(c.x, c.y);
          this.wallet.credit(res.payout);
          this.streak += 1;
          this.bestStreak = Math.max(this.bestStreak, this.streak);
          this.renderStreak(true);
          this.finishRound(slot, res);
        });

        slot.on('pop', (res) => {
          BF.sound.stopInflate(slot.id);
          BF.sound.play('pop');
          const c = view.center;
          this.particles.pop(c.x, c.y, view.colors, clamp(c.radius / 90, 0.6, 1.4));
          view.onPop(res);
          this.streak = 0;
          this.renderStreak();
          this.finishRound(slot, res);
        });

        slot.on('reset', () => view.onReset());
      });
    }

    finishRound(slot, res) {
      const gained = this.progress.awardRound({
        bet: slot.bet, won: res.won, multiplier: res.multiplier, streak: this.streak, golden: slot.golden,
      });
      this.feed.push({
        name: 'You', you: true, won: res.won, golden: slot.golden,
        multiplier: res.multiplier, amount: res.won ? res.payout : slot.bet,
      });
      this.floatXp(slot.id, gained);
      this.save();
      setTimeout(() => slot.reset(), C.RESULT_HOLD_MS);
    }

    /** Validates a slot's inputs; returns {bet, auto} or null (and flags the field). */
    readInputs(i) {
      const view = this.views[i];
      const bet = round2(view.bet);
      if (!(bet >= C.MIN_BET) || bet > C.MAX_BET) {
        view.flagInvalid('bet');
        this.toast(`Bet must be between ${money(C.MIN_BET)} and ${money(C.MAX_BET)}`, 'error');
        return null;
      }
      const auto = view.autoTarget;
      if (view.r.autoOn.checked && !(auto >= 1.01)) {
        view.flagInvalid('auto');
        this.toast('Auto cash out must be at least 1.01x', 'error');
        return null;
      }
      return { bet, auto };
    }

    canStart(i) { return this.slots[i].isIdle && !this.pending.has(i); }

    async startSlots(indices) {
      indices = indices.filter((i) => this.canStart(i));
      if (!indices.length) return;
      const inputs = indices.map((i) => this.readInputs(i));
      if (inputs.some((x) => !x)) return;
      const total = inputs.reduce((sum, x) => sum + x.bet, 0);
      if (!this.wallet.canAfford(total)) {
        indices.forEach((i) => this.views[i].flagInvalid('bet'));
        this.toast('Insufficient balance for that bet', 'error');
        return;
      }

      BF.sound.unlock();
      // Only one Golden Balloon at a time. Random order so neither slot is favoured.
      const order = indices.map((i, k) => k).sort(() => Math.random() - 0.5);
      let goldenTaken = this.slots.some((s) => s.isFilling && s.golden);
      const rounds = [];
      indices.forEach((i) => this.pending.add(i));
      inputs.forEach((x) => this.wallet.debit(x.bet));
      for (const k of order) {
        const round = await this.provider.createRound({
          allowGolden: !goldenTaken,
          goldenChance: this.progress.goldenChance,
        });
        if (round.golden) goldenTaken = true;
        rounds[k] = round;
      }
      const now = performance.now();
      indices.forEach((i, k) => {
        this.pending.delete(i);
        this.slots[i].start(rounds[k], inputs[k].bet, inputs[k].auto, now);
      });
      this.save();
    }

    cashOut(i) { this.slots[i].cashOut(performance.now()); }

    slotAction(i) {
      if (this.slots[i].isFilling) this.cashOut(i);
      else if (this.canStart(i)) this.startSlots([i]);
    }

    bigAction() {
      const filling = this.slots.filter((s) => s.isFilling);
      if (filling.length) filling.forEach((s) => this.cashOut(s.id));
      else if (this.slots.every((s, i) => this.canStart(i))) this.startSlots([0, 1]);
    }

    /* ================= UI wiring ================= */

    bindUI() {
      document.addEventListener('pointerdown', () => BF.sound.unlock(), { once: true });

      this.views.forEach((view, i) => {
        view.r.action.addEventListener('click', () => this.slotAction(i));
        view.r.half.addEventListener('click', () => {
          view.bet = Math.max(C.MIN_BET, round2(view.bet / 2));
          BF.sound.play('click');
          this.save();
        });
        view.r.double.addEventListener('click', () => {
          const cap = Math.max(C.MIN_BET, Math.min(C.MAX_BET, this.wallet.balance));
          view.bet = clamp(round2(view.bet * 2), C.MIN_BET, cap);
          BF.sound.play('click');
          this.save();
        });
        view.r.bet.addEventListener('change', () => {
          view.bet = clamp(round2(view.bet) || C.MIN_BET, C.MIN_BET, C.MAX_BET);
          this.save();
        });
        view.r.auto.addEventListener('change', () => {
          const v = parseFloat(view.r.auto.value);
          view.r.auto.value = clamp(Number.isFinite(v) ? v : 2, 1.01, C.MAX_MULTIPLIER).toFixed(2);
          view.r.autoOn.checked = true;
          this.save();
        });
        view.r.autoOn.addEventListener('change', () => this.save());
        ['bet', 'auto'].forEach((k) => view.r[k].addEventListener('animationend', () => view.r[k].classList.remove('invalid')));
      });

      $('#big-btn').addEventListener('click', () => this.bigAction());

      $('#sound-btn').addEventListener('click', () => {
        BF.sound.setEnabled(!BF.sound.enabled);
        if (BF.sound.enabled) { BF.sound.unlock(); BF.sound.play('click'); }
        this.slots.forEach((s) => { if (s.isFilling && BF.sound.enabled) BF.sound.startInflate(s.id); });
        this.renderSoundBtn();
        this.save();
      });

      $('#refill-btn').addEventListener('click', () => {
        this.wallet.credit(this.progress.refillAmount);
        this.toast(`${money(this.progress.refillAmount)} free chips added`, 'win');
        BF.sound.play('cashout');
        this.save();
      });

      $('#reset-btn').addEventListener('click', () => {
        if (window.confirm('Reset balance, level, skins and streak?')) {
          BF.storage.clear();
          window.location.reload();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.repeat) return;
        if (e.code === 'Space') {
          if (e.target.tagName === 'BUTTON') return; // let the focused button handle it
          e.preventDefault();
          this.bigAction();
        }
        else if (e.key === '1') this.slotAction(0);
        else if (e.key === '2') this.slotAction(1);
      });

      this.wallet.on('change', ({ delta }) => {
        const box = $('#balance-box');
        box.classList.remove('up', 'down');
        void box.offsetWidth;
        box.classList.add(delta >= 0 ? 'up' : 'down');
      });
    }

    bindProgress() {
      this.progress.on('change', () => this.renderProgress());
      this.progress.on('levelup', ({ level, unlocked, perks }) => {
        BF.sound.play('levelup');
        this.particles.confetti(window.innerWidth / 2, window.innerHeight * 0.85);
        const extras = [
          ...unlocked.map((s) => `${s.name} skin`),
          ...perks.map((p) => p.label),
        ];
        this.toast(`Level ${level}!${extras.length ? ' Unlocked: ' + extras.join(' · ') : ''}`, 'level');
        this.renderSkins();
      });
    }

    /* ================= render ================= */

    frame(now) {
      this.slots.forEach((slot, i) => {
        slot.update(now);
        this.views[i].render(now, this.particles);
        if (slot.isFilling) BF.sound.updateInflate(slot.id, slot.multiplier);
      });
      this.particles.step(now);
      this.renderBalance();
      this.renderBigButton();
      requestAnimationFrame(this.frame);
    }

    renderBalance() {
      const target = this.wallet.balance;
      if (Math.abs(this.displayBalance - target) < 0.005) {
        if (this.displayBalance === target) return;
        this.displayBalance = target;
      } else {
        this.displayBalance += (target - this.displayBalance) * 0.18;
      }
      $('#balance-value').textContent = money(this.displayBalance);

      const busy = this.slots.some((s) => !s.isIdle) || this.pending.size > 0;
      $('#refill-btn').classList.toggle('hidden', busy || target >= C.MIN_BET);
    }

    renderBigButton() {
      const btn = $('#big-btn');
      const filling = this.slots.filter((s) => s.isFilling);
      let label;
      let sub;
      let mode;
      if (filling.length) {
        mode = 'cash';
        label = filling.length === 2 ? 'Cash Out Both' : `Cash Out Balloon ${filling[0].id + 1}`;
        sub = money(filling.reduce((sum, s) => sum + s.potentialWin, 0));
      } else if (this.slots.every((s, i) => this.canStart(i))) {
        mode = 'start';
        label = 'Start Both';
        sub = `Total bet ${money(this.views.reduce((sum, v) => sum + (v.bet || 0), 0))}`;
      } else {
        mode = 'wait';
        label = 'Refilling…';
        sub = 'Get ready';
      }
      if (btn.dataset.mode !== mode) {
        btn.dataset.mode = mode;
        btn.disabled = mode === 'wait';
      }
      const l = $('#big-label');
      const s = $('#big-sub');
      if (l.textContent !== label) l.textContent = label;
      if (s.textContent !== sub) s.textContent = sub;
    }

    renderStreak(bump) {
      $('#streak-value').textContent = this.streak;
      $('#streak-best').textContent = `best ${this.bestStreak}`;
      const chip = $('#streak-chip');
      chip.classList.toggle('hot', this.streak >= 3);
      if (bump) {
        chip.classList.remove('bump');
        void chip.offsetWidth;
        chip.classList.add('bump');
      }
    }

    renderProgress() {
      const p = this.progress;
      $('#level-value').textContent = p.level;
      $('#level-chip-value').textContent = p.level;
      $('#xp-text').textContent = `${p.xp.toLocaleString('en-US')} / ${p.needed.toLocaleString('en-US')} XP`;
      $('#xp-fill').style.width = `${(p.xp / p.needed) * 100}%`;

      const nextPerk = p.nextPerk;
      const nextSkin = p.nextSkin();
      const next = [nextPerk && { level: nextPerk.level, text: nextPerk.label },
        nextSkin && { level: nextSkin.level, text: `${nextSkin.name} skin` }]
        .filter(Boolean).sort((a, b) => a.level - b.level)[0];
      $('#next-perk').textContent = next ? `Next reward at level ${next.level}: ${next.text}` : 'All rewards unlocked — legend status!';

      const list = $('#perk-list');
      if (list.dataset.level !== String(p.level)) {
        list.dataset.level = p.level;
        list.innerHTML = BF.Progress.PERKS.map((perk) => `
          <li class="${perk.level <= p.level ? 'on' : ''}"><span>Lv ${perk.level}</span>${perk.label}</li>`).join('');
      }
    }

    renderSkins() {
      const grid = $('#skin-grid');
      grid.innerHTML = '';
      BF.SKINS.forEach((skin) => {
        const unlocked = this.progress.isUnlocked(skin);
        const card = document.createElement('div');
        card.className = `skin-card${unlocked ? '' : ' locked'}${skin.fx ? ' fx-' + skin.fx : ''}`;
        BF.applySkinVars(card, skin);
        const eq = [0, 1].map((i) => this.equipped[i] === skin.id);
        card.innerHTML = `
          <div class="skin-preview">${BF.balloonSVG('skin-' + skin.id)}</div>
          <div class="skin-name">${skin.name}</div>
          ${unlocked
            ? `<div class="skin-equip">${[0, 1].map((i) => `<button type="button" class="${eq[i] ? 'on' : ''}" data-slot="${i}">B${i + 1}</button>`).join('')}</div>`
            : `<div class="skin-lock"><svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3h1v11H6V10zm2 0h6V7a3 3 0 0 0-6 0z" fill="currentColor"/></svg>Level ${skin.level}</div>`}`;
        card.querySelectorAll('button[data-slot]').forEach((b) => b.addEventListener('click', () => {
          const i = Number(b.dataset.slot);
          this.equipped[i] = skin.id;
          this.views[i].setSkin(skin);
          BF.sound.play('click');
          this.renderSkins();
          this.save();
        }));
        grid.appendChild(card);
      });
    }

    renderSoundBtn() {
      const b = $('#sound-btn');
      b.classList.toggle('muted', !BF.sound.enabled);
      b.setAttribute('aria-pressed', String(BF.sound.enabled));
    }

    floatXp(slotId, xp) {
      const stage = this.views[slotId].r.stage;
      const el = document.createElement('div');
      el.className = 'xp-float';
      el.textContent = `+${xp} XP`;
      stage.appendChild(el);
      setTimeout(() => el.remove(), 1600);
    }

    toast(msg, kind = 'info') {
      const box = $('#toasts');
      const el = document.createElement('div');
      el.className = `toast ${kind}`;
      el.textContent = msg;
      box.appendChild(el);
      while (box.children.length > 3) box.firstChild.remove();
      setTimeout(() => el.classList.add('out'), 2800);
      setTimeout(() => el.remove(), 3300);
    }

    save() {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        BF.storage.save({
          balance: this.wallet.balance,
          progress: this.progress.toJSON(),
          streak: this.streak,
          bestStreak: this.bestStreak,
          equipped: this.equipped,
          sound: BF.sound.enabled,
          settings: this.views.map((v) => v.settings),
        });
      }, 250);
    }
  }

  document.addEventListener('DOMContentLoaded', () => { BF.game = new Game(); });
})();
