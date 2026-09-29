/**
 * Game controller — wires the shared round engine and the player's bets
 * (RoundEngine, BetSlot, Wallet, Progress, Rewards) to the views and runs the
 * render loop.
 */
(function () {
  const C = BF.CONFIG;
  const { $, money, mult, clamp, round2 } = BF.util;

  class Game {
    constructor() {
      const saved = BF.storage.load();

      // Bets placed but not yet locked when the page closed are refunded.
      const refund = saved.openBets || 0;
      this.wallet = new BF.Wallet((saved.balance !== undefined ? saved.balance : C.STARTING_BALANCE) + refund);
      this.progress = new BF.Progress(saved.progress);
      this.rewards = new BF.Rewards(saved.rewards);
      this.streak = saved.streak || 0;
      this.bestStreak = saved.bestStreak || 0;
      this.equipped = saved.equipped || ['neon-pink', 'electric-blue'];
      this.topWins = [];
      this.autoBets = []; // rounds of auto bet left per balloon (0 = off); never persisted
      this.displayBalance = this.wallet.balance;

      BF.sound.setEnabled(saved.sound !== false);
      this.particles = new BF.ParticleSystem($('#fx-canvas'));

      this.clientSeed = saved.clientSeed || BF.fair.newClientSeed();
      this.engine = new BF.RoundEngine(new BF.fair.FairRoundProvider());
      this.slots = [];
      this.views = [];
      const settings = saved.settings || [];
      for (let i = 0; i < C.BALLOONS; i++) {
        this.slots.push(new BF.BetSlot(i));
        this.views.push(new BF.BalloonView(i, $('#balloons'), {
          bet: settings[i] ? settings[i].bet : C.DEFAULT_BETS[i],
          auto: settings[i] ? settings[i].auto : C.DEFAULT_AUTO[i],
          autoOn: settings[i] ? settings[i].autoOn : false,
          skin: this.skinFor(i),
        }));
      }

      this.feed = new BF.LiveFeed($('#feed-list'), $('#online-count'), C.FEED_MAX_ITEMS);
      this.feed.on('entry', (e) => this.trackTopWin(e));
      this.crowd = new BF.CrowdSimulator(this.feed, this.engine);

      this.bindEngine();
      this.bindSlots();
      this.bindUI();
      this.bindProgress();
      this.bindRewards();
      this.renderProgress();
      this.renderRewards();
      this.renderSkins();
      this.renderStreak();
      this.renderSoundBtn();
      $('#balance-value').textContent = money(this.wallet.balance);
      $('#rtp-value').textContent = BF.util.rtp(C.RTP);
      if (refund) this.toast(`${money(refund)} from unlocked bets refunded`, 'info');

      this.engine.start(performance.now());
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
      // Keeps rounds resolving (auto cash-outs, pops) while the tab is in the background.
      setInterval(() => this.tick(performance.now()), 250);
      // New day → new missions and a claimable bonus, even if the tab stays open.
      setInterval(() => { if (this.rewards.rollover()) this.save(); this.renderRewards(); }, 30000);
    }

    skinFor(i) {
      const skin = BF.skinById(this.equipped[i]);
      return this.progress.isUnlocked(skin) ? skin : BF.SKINS[i];
    }

    balloon(i) { return this.engine.balloons[i] || null; }

    /* ================= round flow ================= */

    bindEngine() {
      const e = this.engine;

      e.on('betting', () => {
        this.slots.forEach((slot, i) => {
          slot.clear();
          this.views[i].onBetting();
          if (slot.queued) {
            const { amount, auto } = slot.queued;
            slot.queued = null;
            this.placeBet(i, amount, auto, true);
          }
          if (slot.status === 'none' && this.autoBets[i] > 0) this.autoPlace(i);
        });
      });

      e.on('locked', ({ balloons }) => {
        this.slots.forEach((slot) => slot.activate());
        balloons.forEach((b, i) => {
          this.views[i].onLocked(b, this.slots[i].isActive);
          if (b.golden) {
            BF.sound.play('golden');
            BF.sound.vibrate([20, 40, 20, 40, 20]);
            const c = this.views[i].center;
            for (let k = 0; k < 12; k++) this.particles.glitter(c.x, c.y, c.radius * 1.4);
            this.toast(`★ Balloon ${i + 1} is GOLDEN — it climbs ${C.GOLDEN_SPEED}× faster with the same chance to pop. Max ${C.GOLDEN_CAP}x.`, 'gold');
          }
        });
        this.save();
      });

      e.on('launch', () => {
        this.views.forEach((v) => v.onLaunch());
        this.slots.forEach((slot, i) => { if (slot.isActive) BF.sound.startInflate(i); });
        BF.sound.play('start');
      });

      e.on('balloonEnd', (b) => {
        const slot = this.slots[b.index];
        const hadBet = slot.status !== 'none';
        slot.resolve(b, b.endTimeMs); // settles auto cash-out / pop / cap for this bet
        const view = this.views[b.index];
        const c = view.center;
        if (b.state === 'popped') {
          BF.sound.play('pop');
          if (hadBet) BF.sound.vibrate([60, 40, 90]);
          this.particles.pop(c.x, c.y, view.colors(b.golden), clamp(c.radius / 90, 0.6, 1.4));
        } else {
          this.particles.cashout(c.x, c.y, true);
          this.particles.confetti(c.x, c.y);
        }
        const res = hadBet ? { won: slot.status === 'cashed', payout: slot.result && slot.result.payout, lost: slot.amount } : null;
        view.onBalloonEnd(b, res, this.engine.roundNo);
      });
    }

    bindSlots() {
      this.slots.forEach((slot, i) => {
        const view = this.views[i];

        slot.on('cashout', (res) => {
          const b = this.balloon(i);
          BF.sound.stopInflate(i);
          BF.sound.play('cashout');
          BF.sound.vibrate(30);
          const c = view.center;
          this.particles.cashout(c.x, c.y, b && b.golden);
          if (res.multiplier >= 10) this.particles.confetti(c.x, c.y);
          view.onCashout(res);
          this.wallet.credit(res.payout);
          this.streak += 1;
          this.bestStreak = Math.max(this.bestStreak, this.streak);
          this.renderStreak(true);
          this.finishBet(slot, res, b && b.golden);
        });

        slot.on('lost', (res) => {
          const b = this.balloon(i);
          BF.sound.stopInflate(i);
          this.streak = 0;
          this.renderStreak();
          this.finishBet(slot, res, b && b.golden);
        });
      });
    }

    finishBet(slot, res, golden) {
      const gained = this.progress.awardRound({
        bet: slot.amount, won: res.won, multiplier: res.multiplier, streak: this.streak, golden,
      });
      this.rewards.recordRound({
        won: res.won, multiplier: res.multiplier, payout: res.payout, bet: slot.amount,
        auto: !!res.auto, golden, streak: this.streak,
      });
      this.feed.push({
        name: 'You', you: true, won: res.won, golden, balloon: slot.index,
        multiplier: res.multiplier, amount: res.won ? res.payout : slot.amount,
      });
      this.floatXp(slot.index, gained);
      this.save();
    }

    /* ================= player actions ================= */

    /** Validates a slot's inputs; returns {amount, auto} or null (and flags the field). */
    readInputs(i) {
      const view = this.views[i];
      const amount = round2(view.bet);
      if (!(amount >= C.MIN_BET) || amount > C.MAX_BET) {
        view.flagInvalid('bet');
        this.toast(`Bet must be between ${money(C.MIN_BET)} and ${money(C.MAX_BET)}`, 'error');
        return null;
      }
      const auto = view.autoTarget === null ? null : round2(view.autoTarget);
      if (view.r.autoOn.checked && !(auto >= 1.01)) {
        view.flagInvalid('auto');
        this.toast('Auto cash out must be at least 1.01x', 'error');
        return null;
      }
      return { amount, auto };
    }

    /** Places a bet during the betting window (debits the wallet). */
    placeBet(i, amount, auto, fromQueue = false) {
      const slot = this.slots[i];
      if (this.engine.phase !== 'betting' || slot.status !== 'none') return false;
      if (!this.wallet.canAfford(amount)) {
        this.views[i].flagInvalid('bet');
        this.toast(fromQueue ? `Next-round bet on Balloon ${i + 1} skipped: insufficient balance` : 'Insufficient balance for that bet', 'error');
        return false;
      }
      this.wallet.debit(amount);
      slot.place(amount, auto);
      this.engine.addBettor('You', this.clientSeed); // counts if you're among the first bettors
      BF.sound.play('click');
      this.save();
      return true;
    }

    /* ---------- auto bet ---------- */

    /** Places this round's automatic bet for balloon i with its current inputs. */
    autoPlace(i) {
      const input = this.readInputs(i);
      if (!input) { this.stopAutoBet(i, `Auto bet on Balloon ${i + 1} stopped: check the bet settings`); return; }
      if (!this.placeBet(i, input.amount, input.auto, true)) {
        this.stopAutoBet(i, `Auto bet on Balloon ${i + 1} stopped: not enough balance`);
        return;
      }
      this.autoBets[i] -= 1;
      if (this.autoBets[i] === 0) this.stopAutoBet(i, `Auto bet on Balloon ${i + 1} finished`);
    }

    startAutoBet(i) {
      const view = this.views[i];
      const rounds = clamp(Math.floor(parseFloat(view.r.autoBetRounds.value) || 0), 1, C.AUTO_BET_MAX_ROUNDS);
      view.r.autoBetRounds.value = rounds;
      if (!this.readInputs(i)) { view.r.autoBetOn.checked = false; return; }
      this.autoBets[i] = rounds;
      BF.sound.play('click');
      // Betting is open and this balloon has no bet yet: the first auto bet goes in now.
      if (this.engine.phase === 'betting' && this.slots[i].status === 'none') this.autoPlace(i);
    }

    stopAutoBet(i, message) {
      this.autoBets[i] = 0;
      this.views[i].r.autoBetOn.checked = false;
      if (message) this.toast(message, 'info');
    }

    cancelBet(i) {
      const slot = this.slots[i];
      const amount = slot.amount;
      if (this.autoBets[i] > 0) this.stopAutoBet(i, `Auto bet on Balloon ${i + 1} stopped`);
      if (slot.cancel()) {
        this.wallet.credit(amount);
        BF.sound.play('click');
        this.save();
      }
    }

    cashOut(i) {
      this.tick(performance.now()); // a pop that already happened wins the race
      this.slots[i].cashOut(this.balloon(i));
    }

    /** The per-balloon button. */
    slotAction(i) {
      BF.sound.unlock();
      const slot = this.slots[i];
      const phase = this.engine.phase;
      if (slot.isActive && phase === 'flying') return this.cashOut(i);
      if (phase === 'betting') {
        if (slot.status === 'placed') return this.cancelBet(i);
        const input = this.readInputs(i);
        if (input) this.placeBet(i, input.amount, input.auto);
        return undefined;
      }
      if (slot.isActive) return undefined; // locked, waiting for launch
      // Round in progress: queue (or un-queue) a bet for the next round.
      if (slot.queued) {
        slot.queued = null;
      } else {
        const input = this.readInputs(i);
        if (input) slot.queued = input;
      }
      BF.sound.play('click');
      return undefined;
    }

    /** The big button: bet on both / cancel / cash out all / queue both. */
    bigAction() {
      BF.sound.unlock();
      const mode = this.bigState().mode;
      const idx = this.slots.map((s, i) => i);
      if (mode === 'cash') idx.forEach((i) => { if (this.slots[i].isActive) this.cashOut(i); });
      else if (mode === 'cancel') idx.forEach((i) => this.cancelBet(i));
      else if (mode === 'bet') {
        const open = idx.filter((i) => this.slots[i].status === 'none');
        const inputs = open.map((i) => this.readInputs(i));
        if (inputs.some((x) => !x)) return;
        const total = inputs.reduce((sum, x) => sum + x.amount, 0);
        if (!this.wallet.canAfford(total)) {
          open.forEach((i) => this.views[i].flagInvalid('bet'));
          this.toast('Insufficient balance for those bets', 'error');
          return;
        }
        open.forEach((i, k) => this.placeBet(i, inputs[k].amount, inputs[k].auto));
      } else if (mode === 'queue') {
        idx.forEach((i) => { if (!this.slots[i].queued && !this.slots[i].isActive) { const x = this.readInputs(i); if (x) this.slots[i].queued = x; } });
      } else if (mode === 'unqueue') {
        this.slots.forEach((s) => { s.queued = null; });
      }
    }

    /* ================= derived UI state ================= */

    actionState(i) {
      const slot = this.slots[i];
      const phase = this.engine.phase;
      const b = this.balloon(i);
      const view = this.views[i];
      if (phase === 'betting') {
        return slot.status === 'placed'
          ? { mode: 'cancel', label: 'Cancel Bet', sub: `${money(slot.amount)} placed` }
          : { mode: 'start', label: 'Place Bet', sub: money(view.bet) };
      }
      if (slot.isActive && phase === 'flying' && b && b.isFilling) {
        return { mode: 'cash', label: 'Cash Out', sub: money(slot.potentialWin(b)) };
      }
      if (slot.isActive) return { mode: 'locked', label: 'Bet Locked', sub: money(slot.amount), disabled: true };
      if (slot.queued) return { mode: 'queued', label: 'Cancel Next Bet', sub: `${money(slot.queued.amount)} next round` };
      return { mode: 'next', label: 'Bet Next Round', sub: money(view.bet) };
    }

    bigState() {
      const phase = this.engine.phase;
      const active = this.slots.filter((s, i) => s.isActive && phase === 'flying' && this.balloon(i) && this.balloon(i).isFilling);
      if (active.length) {
        const total = active.reduce((sum, s) => sum + s.potentialWin(this.balloon(s.index)), 0);
        return { mode: 'cash', label: active.length > 1 ? 'Cash Out All' : `Cash Out Balloon ${active[0].index + 1}`, sub: money(total) };
      }
      const betTotal = () => money(this.views.reduce((sum, v) => sum + (v.bet || 0), 0));
      if (phase === 'betting') {
        const open = this.slots.filter((s) => s.status === 'none');
        if (!open.length) return { mode: 'cancel', label: 'Cancel Bets', sub: `${money(this.slots.reduce((s, x) => s + x.amount, 0))} placed` };
        const label = open.length === this.slots.length ? 'Bet on Both' : `Bet Balloon ${open[0].index + 1} Too`;
        return { mode: 'bet', label, sub: `Total ${money(open.reduce((sum, s) => sum + (this.views[s.index].bet || 0), 0))}` };
      }
      if (phase === 'reveal') return { mode: 'wait', label: 'Bets Locked', sub: 'Get ready…', disabled: true };
      if (this.slots.some((s) => s.queued)) return { mode: 'unqueue', label: 'Cancel Next Bets', sub: 'Queued for next round' };
      return { mode: 'queue', label: 'Bet Both Next Round', sub: `Total ${betTotal()}` };
    }

    /* ================= UI wiring ================= */

    bindUI() {
      // Phones only allow audio after a completed tap (touchend/click), not on touch-down,
      // so keep trying on every real gesture until the browser reports audio running.
      const unlockAudio = () => {
        BF.sound.unlock();
        if (BF.sound.running) ['click', 'touchend', 'keydown'].forEach((t) => document.removeEventListener(t, unlockAudio, true));
      };
      ['click', 'touchend', 'keydown'].forEach((t) => document.addEventListener(t, unlockAudio, true));

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

        this.autoBets[i] = 0;
        if (!C.AUTO_BET) view.r.autoBetRow.hidden = true; // operator switched autoplay off
        view.r.autoBetRounds.max = C.AUTO_BET_MAX_ROUNDS;
        view.r.autoBetOn.addEventListener('change', () => {
          if (view.r.autoBetOn.checked) this.startAutoBet(i);
          else this.stopAutoBet(i);
        });
        ['bet', 'auto'].forEach((k) => view.r[k].addEventListener('animationend', () => view.r[k].classList.remove('invalid')));
      });

      $('#big-btn').addEventListener('click', () => this.bigAction());

      const rules = $('#rules-dialog');
      const openRules = () => {
        $('#rules-body').innerHTML = BF.rules.html();
        rules.showModal();
      };
      $('#rules-btn').addEventListener('click', openRules);
      $('#rules-link').addEventListener('click', openRules);
      $('#rules-close').addEventListener('click', () => rules.close());
      rules.addEventListener('click', (e) => { if (e.target === rules) rules.close(); }); // backdrop

      const howTo = $('#howto-dialog');
      const openHowTo = () => {
        $('#howto-body').innerHTML = BF.rules.howTo();
        if (!howTo.open) howTo.showModal();
      };
      $('#howto-btn').addEventListener('click', openHowTo);
      $('#howto-link').addEventListener('click', openHowTo);
      $('#howto-close').addEventListener('click', () => howTo.close());
      howTo.addEventListener('click', (e) => {
        if (e.target === howTo || e.target.closest('[data-close]')) howTo.close();
        else if (e.target.closest('[data-open-rules]')) { howTo.close(); openRules(); }
      });
      // First visit: show the guide once.
      const seenKey = `${C.STORAGE_KEY}.howto`;
      let seen = true;
      try { seen = !!window.localStorage.getItem(seenKey); window.localStorage.setItem(seenKey, '1'); } catch (e) { /* storage blocked */ }
      if (!seen) setTimeout(openHowTo, 400);
      this.bindFair();

      $('#sound-btn').addEventListener('click', () => {
        BF.sound.setEnabled(!BF.sound.enabled);
        if (BF.sound.enabled) {
          BF.sound.unlock();
          BF.sound.play('click');
          this.slots.forEach((s, i) => { if (s.isActive && this.engine.phase === 'flying') BF.sound.startInflate(i); });
        }
        this.renderSoundBtn();
        this.save();
      });

      $('#refill-btn').addEventListener('click', () => {
        this.wallet.credit(this.progress.refillAmount);
        this.toast(`${money(this.progress.refillAmount)} free chips added`, 'win');
        BF.sound.play('cashout');
        this.save();
      });

      // Two-step reset (no browser confirm(): embedded viewers block it).
      $('#reset-btn').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        if (btn.dataset.armed) {
          BF.storage.clear();
          window.location.reload();
          return;
        }
        btn.dataset.armed = '1';
        btn.textContent = 'Click again to reset balance, level, skins and streak';
        setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Reset progress'; }, 4000);
      });

      document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.repeat || $('#rules-dialog').open || $('#fair-dialog').open || $('#howto-dialog').open) return;
        if (e.code === 'Space') {
          if (e.target.tagName === 'BUTTON') return; // let the focused button handle it
          e.preventDefault();
          this.bigAction();
        } else if (e.key === '1') this.slotAction(0);
        else if (e.key === '2') this.slotAction(1);
      });

      this.wallet.on('change', ({ delta }) => {
        const box = $('#balance-box');
        box.classList.remove('up', 'down');
        void box.offsetWidth;
        box.classList.add(delta >= 0 ? 'up' : 'down');
      });
    }

    /* ================= provably fair ================= */

    bindFair() {
      const dlg = $('#fair-dialog');
      const body = $('#fair-body');
      this.fairView = null; // null = overview, else round number
      const show = (roundNo = null) => {
        this.fairView = roundNo;
        this.renderFair();
        body.scrollTop = 0;
        if (!dlg.open) dlg.showModal();
      };
      $('#fair-btn').addEventListener('click', () => show());
      $('#fair-link').addEventListener('click', () => show());
      $('#fair-close').addEventListener('click', () => dlg.close());
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) { dlg.close(); return; }
        const verify = e.target.closest('[data-verify-round]');
        if (verify) show(Number(verify.dataset.verifyRound));
        else if (e.target.closest('[data-fair-back]')) show();
        else if (e.target.closest('[data-fair-random]')) $('#fair-seed-input').value = BF.fair.newClientSeed();
        else if (e.target.closest('[data-fair-save]')) this.saveClientSeed($('#fair-seed-input').value);
      });
      // Balloon history chips open that round's proof.
      this.views.forEach((v) => v.r.history.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-round]');
        if (chip) show(Number(chip.dataset.round));
      }));
      // Refresh the overview when a round changes phase (new fingerprint, new history row).
      ['betting', 'locked', 'ended'].forEach((evt) => this.engine.on(evt, () => {
        if (dlg.open && this.fairView === null) this.renderFair();
      }));
    }

    renderFair() {
      const body = $('#fair-body');
      if (this.fairView === null) {
        const typing = document.activeElement && document.activeElement.id === 'fair-seed-input';
        if (typing) return; // don't wipe what the player is typing
        body.innerHTML = BF.fairView.overview({
          clientSeed: this.clientSeed,
          commitment: this.engine.commitment,
          nextHash: this.engine.provider.nextServerSeedHash,
          phase: this.engine.phase,
          roundNo: this.engine.roundNo,
          history: this.engine.history,
        });
        return;
      }
      const proof = this.engine.proofFor(this.fairView);
      body.innerHTML = proof
        ? BF.fairView.round(proof)
        : `<button type="button" class="fair-link back" data-fair-back>← All rounds</button>
           <p>Round #${this.fairView} ${this.fairView === this.engine.roundNo ? 'is still in progress. Its server seed is revealed when the round ends.' : 'is no longer in the recent history.'}</p>`;
    }

    saveClientSeed(value) {
      const seed = String(value).trim();
      if (!/^[A-Za-z0-9]{1,32}$/.test(seed)) {
        this.toast('Client seed must be 1–32 letters or numbers', 'error');
        return;
      }
      this.clientSeed = seed;
      this.toast('Client seed saved — used when you are one of the first 3 bettors', 'win');
      this.save();
      this.renderFair();
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

    bindRewards() {
      this.rewards.on('change', () => this.renderRewards());
      this.rewards.on('complete', (def) => {
        BF.sound.play('golden');
        this.toast(`Mission complete: ${def.text} — claim your reward!`, 'win');
      });

      $('#bonus-btn').addEventListener('click', () => {
        const amount = this.rewards.claimBonus(this.progress.bonusMultiplier);
        if (!amount) return;
        this.wallet.credit(amount);
        BF.sound.play('cashout');
        BF.sound.vibrate(30);
        const b = $('#bonus-btn').getBoundingClientRect();
        this.particles.cashout(b.left + b.width / 2, b.top, true);
        this.toast(`Daily bonus: ${money(amount)} added (day ${this.rewards.bonusStreak})`, 'win');
        this.save();
      });

      $('#mission-list').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-mission]');
        if (!btn) return;
        const reward = this.rewards.claimMission(btn.dataset.mission);
        if (!reward) return;
        this.wallet.credit(reward.chips);
        this.progress.addXp(reward.xp);
        BF.sound.play('cashout');
        const b = btn.getBoundingClientRect();
        this.particles.cashout(b.left + b.width / 2, b.top, false);
        this.toast(`Mission reward: ${money(reward.chips)} + ${reward.xp} XP`, 'win');
        this.save();
      });
    }

    trackTopWin(entry) {
      if (!entry.won) return;
      this.topWins.push(entry);
      this.topWins.sort((a, b) => b.amount - a.amount);
      this.topWins.length = Math.min(this.topWins.length, 5);
      if (this.topWins.includes(entry)) this.renderTopWins();
    }

    /* ================= render ================= */

    /** Advances game logic (engine + auto cash-outs). Safe to call often. */
    tick(now) {
      this.engine.update(now);
      if (this.engine.phase === 'flying') {
        const elapsed = now - this.engine.startAt;
        this.slots.forEach((slot, i) => slot.resolve(this.balloon(i), elapsed));
      }
      this.crowd.update();
    }

    frame(now) {
      this.tick(now);
      const phase = this.engine.phase;
      const remaining = this.engine.remaining(now);
      this.slots.forEach((slot, i) => {
        const b = this.balloon(i);
        this.views[i].render(now, {
          phase, remaining, balloon: b,
          crowd: this.crowd.stats(i, now),
          action: this.actionState(i),
          // Editable again as soon as this round's bet is settled, so the next bet can be set up early.
          inputsLocked: slot.status === 'placed' || slot.isActive || !!slot.queued,
        }, this.particles);
        if (slot.isActive && b && b.isFilling) BF.sound.updateInflate(i, b.multiplier);
      });
      this.particles.step(now);
      this.renderRoundBar(now, phase, remaining);
      this.renderBalance();
      this.renderBigButton();
      this.renderSoundState();
      this.renderAutoBets();
      requestAnimationFrame(this.frame);
    }

    renderRoundBar(now, phase, remaining) {
      const labels = {
        betting: `Place your bets · ${(remaining / 1000).toFixed(1)}s`,
        reveal: 'Bets locked',
        flying: 'Balloons filling — cash out before they pop!',
        ended: `Round over · next in ${Math.ceil(remaining / 1000)}s`,
      };
      let pct = 0;
      if (phase === 'betting') pct = remaining / C.BETTING_MS;
      else if (phase === 'reveal') pct = 0;
      else if (phase === 'ended') pct = 1 - remaining / C.ROUND_END_MS;
      else pct = 1;
      const setText = (id, text) => { const el = $(id); if (el.textContent !== text) el.textContent = text; };
      setText('#round-no', `Round #${this.engine.roundNo}`);
      setText('#round-phase', labels[phase] || '');
      $('#round-bar').dataset.phase = phase;
      $('#round-progress').style.transform = `scaleX(${clamp(pct, 0, 1).toFixed(4)})`;
    }

    renderBalance() {
      const target = this.wallet.balance;
      if (Math.abs(this.displayBalance - target) < 0.005) {
        if (this.displayBalance !== target) {
          this.displayBalance = target;
          $('#balance-value').textContent = money(target);
        }
      } else {
        this.displayBalance += (target - this.displayBalance) * 0.18;
        $('#balance-value').textContent = money(this.displayBalance);
      }
      const busy = this.slots.some((s) => s.status === 'placed' || s.isActive);
      $('#refill-btn').classList.toggle('hidden', busy || target >= C.MIN_BET);
    }

    renderBigButton() {
      const btn = $('#big-btn');
      const st = this.bigState();
      if (btn.dataset.mode !== st.mode) btn.dataset.mode = st.mode;
      btn.disabled = !!st.disabled;
      const l = $('#big-label');
      const s = $('#big-sub');
      if (l.textContent !== st.label) l.textContent = st.label;
      if (s.textContent !== st.sub) s.textContent = st.sub;
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

    renderRewards() {
      const r = this.rewards;
      const streak = r.canClaimBonus ? r.nextBonusStreak : r.bonusStreak;
      $('#bonus-streak').textContent = `Day ${streak} streak`;
      $('#bonus-amount').textContent = money(r.bonusAmount() * this.progress.bonusMultiplier);
      $('#bonus-days').innerHTML = Array.from({ length: 9 }, (_, k) => {
        const reached = k + 1 < streak || (k + 1 === streak && !r.canClaimBonus);
        const current = k + 1 === Math.min(streak, 9) && r.canClaimBonus;
        return `<span class="${reached ? 'done' : ''}${current ? ' now' : ''}"></span>`;
      }).join('');
      const btn = $('#bonus-btn');
      btn.disabled = !r.canClaimBonus;
      btn.textContent = r.canClaimBonus ? 'Claim bonus' : 'Come back tomorrow';
      $('.bonus-card').classList.toggle('ready', r.canClaimBonus);
      $('#bonus-caption').textContent = r.canClaimBonus ? "Today's bonus" : 'Tomorrow, if you come back';

      $('#mission-list').innerHTML = r.missions.map((m) => {
        const def = r.missionDef(m.id);
        const done = r.isComplete(m);
        const shown = def.id === 'profit250' ? `${money(m.progress)} / ${money(def.target)}` : `${Math.floor(m.progress)} / ${def.target}`;
        const action = m.claimed ? '<span class="m-claimed">Claimed ✓</span>'
          : done ? `<button type="button" class="m-claim" data-mission="${m.id}">Claim</button>`
            : `<span class="m-reward">${money(def.chips)}</span>`;
        return `<li class="${done ? 'done' : ''}${m.claimed ? ' claimed' : ''}">
          <div class="m-top"><span>${def.text}</span>${action}</div>
          <div class="m-bar"><i style="width:${Math.min(100, (m.progress / def.target) * 100)}%"></i></div>
          <div class="m-sub">${shown} · +${def.xp} XP</div></li>`;
      }).join('');

      const s = r.stats;
      const rows = [
        ['Bets placed', s.rounds.toLocaleString('en-US')],
        ['Win rate', s.rounds ? `${Math.round((s.wins / s.rounds) * 100)}%` : '—'],
        ['Best multiplier', s.bestMultiplier ? mult(s.bestMultiplier) : '—'],
        ['Biggest win', s.biggestWin ? money(s.biggestWin) : '—'],
        ['Golden balloons', s.goldens.toLocaleString('en-US')],
        ['Best streak', String(this.bestStreak)],
        ['Net profit', `${s.profit < 0 ? '-' : '+'}${money(Math.abs(s.profit))}`],
      ];
      $('#records').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd${k === 'Net profit' ? ` class="${s.profit < 0 ? 'neg' : 'pos'}"` : ''}>${v}</dd></div>`).join('');
      this.renderTopWins();
    }

    renderTopWins() {
      $('#top-wins').innerHTML = this.topWins.length
        ? this.topWins.map((w) => `<li class="${w.you ? 'you' : ''}"><span class="tw-name">${w.you ? 'You' : w.name}</span>
            <span class="tw-mult">${mult(w.multiplier)}</span><span class="tw-amt">${money(w.amount)}</span></li>`).join('')
        : '<li class="empty">Waiting for the first big win…</li>';
    }

    renderSkins() {
      const grid = $('#skin-grid');
      grid.innerHTML = '';
      BF.SKINS.forEach((skin) => {
        const unlocked = this.progress.isUnlocked(skin);
        const card = document.createElement('div');
        card.className = `skin-card${unlocked ? '' : ' locked'}${skin.fx ? ' fx-' + skin.fx : ''}`;
        BF.applySkinVars(card, skin);
        const eq = this.slots.map((s, i) => this.equipped[i] === skin.id);
        card.innerHTML = `
          <div class="skin-preview">${BF.balloonSVG('skin-' + skin.id)}</div>
          <div class="skin-name">${skin.name}</div>
          ${unlocked
            ? `<div class="skin-equip">${eq.map((on, i) => `<button type="button" class="${on ? 'on' : ''}" data-slot="${i}">B${i + 1}</button>`).join('')}</div>`
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

    renderAutoBets() {
      this.views.forEach((v, i) => {
        const left = this.autoBets[i];
        const text = left > 0 ? `${left} left` : '';
        if (v.r.autoBetLeft.textContent !== text) v.r.autoBetLeft.textContent = text;
        v.r.autoBetRow.classList.toggle('on', left > 0);
        v.r.autoBetRounds.disabled = left > 0;
      });
    }

    /** Flags the sound button when sound is on but the browser hasn't started audio yet. */
    renderSoundState() {
      const waiting = BF.sound.enabled && !BF.sound.running;
      if (this.soundWaiting === waiting) return;
      this.soundWaiting = waiting;
      const b = $('#sound-btn');
      b.classList.toggle('waiting', waiting);
      b.title = waiting ? 'Tap anywhere to turn on sound' : 'Toggle sound';
    }

    renderSoundBtn() {
      const b = $('#sound-btn');
      b.classList.toggle('muted', !BF.sound.enabled);
      b.setAttribute('aria-pressed', String(BF.sound.enabled));
    }

    floatXp(i, xp) {
      const stage = this.views[i].r.stage;
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
          openBets: this.slots.reduce((sum, s) => sum + (s.status === 'placed' ? s.amount : 0), 0),
          progress: this.progress.toJSON(),
          rewards: this.rewards.toJSON(),
          streak: this.streak,
          bestStreak: this.bestStreak,
          equipped: this.equipped,
          clientSeed: this.clientSeed,
          sound: BF.sound.enabled,
          settings: this.views.map((v) => v.settings),
        });
      }, 250);
    }
  }

  document.addEventListener('DOMContentLoaded', () => { BF.game = new Game(); });
})();
