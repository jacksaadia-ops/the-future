/**
 * BalloonView — renders one BalloonSlot into a card cloned from
 * #balloon-card-tpl. Reads slot state every animation frame; all game
 * decisions stay in BalloonSlot / the controller.
 */
(function () {
  const { refs, money, mult, clamp, floor2 } = BF.util;
  const HISTORY_MAX = 6;

  /** Visual balloon size (0.38 → 1) for a multiplier; fast early growth, eases out. */
  function sizeFor(m) {
    return 0.38 + 0.62 * (1 - Math.exp(-Math.log(m) * 0.85));
  }

  function tierFor(m) {
    if (m >= 10) return 'tier-4';
    if (m >= 5) return 'tier-3';
    if (m >= 2) return 'tier-2';
    return 'tier-1';
  }

  class BalloonView {
    constructor(slot, mount, { bet, auto, autoOn, skin }) {
      this.slot = slot;
      const tpl = document.getElementById('balloon-card-tpl');
      this.el = tpl.content.firstElementChild.cloneNode(true);
      this.r = refs(this.el);
      this.r.num.textContent = slot.id + 1;
      const C = BF.CONFIG;
      this.r.goldenBanner.innerHTML = `★ Golden · ${C.GOLDEN_SPEED}× speed<span> · max ${C.GOLDEN_CAP}x</span>`;
      this.r.balloon.innerHTML = BF.balloonSVG(`slot${slot.id}`);
      this.r.bet.value = bet.toFixed(2);
      this.r.auto.value = auto.toFixed(2);
      this.r.autoOn.checked = autoOn;
      this.r.bet.id = `bet-${slot.id}`;
      this.r.betLabel.htmlFor = this.r.bet.id;
      this.setSkin(skin);
      mount.appendChild(this.el);

      this.lastTier = '';
      this.lastMultText = '';
      this.nextGlitter = 0;
    }

    /* ---------- inputs ---------- */

    get bet() { return parseFloat(this.r.bet.value) || 0; }
    set bet(v) { this.r.bet.value = v.toFixed(2); }

    get autoTarget() {
      if (!this.r.autoOn.checked) return null;
      const v = parseFloat(this.r.auto.value);
      return Number.isFinite(v) ? v : null;
    }

    get settings() {
      return { bet: this.bet, auto: parseFloat(this.r.auto.value) || 2, autoOn: this.r.autoOn.checked };
    }

    setInputsLocked(locked) {
      ['bet', 'auto', 'autoOn', 'half', 'double'].forEach((k) => { this.r[k].disabled = locked; });
    }

    flagInvalid(which) {
      const el = this.r[which];
      el.classList.remove('invalid');
      void el.offsetWidth; // restart animation
      el.classList.add('invalid');
      el.focus();
    }

    setSkin(skin) {
      this.skin = skin;
      BF.applySkinVars(this.el, skin);
      this.el.classList.toggle('fx-stars', skin.fx === 'stars');
      this.el.classList.toggle('fx-rainbow', skin.fx === 'rainbow');
    }

    /** Colors used by the particle burst (golden overrides skin). */
    get colors() {
      const s = this.slot.golden ? BF.GOLDEN_SKIN : this.skin;
      return [s.main, s.hi, s.deep];
    }

    /** Viewport coordinates of the balloon's center and its approximate radius. */
    get center() {
      const b = this.r.balloon.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height * 0.45, radius: b.width / 2 };
    }

    /* ---------- lifecycle hooks (called by the controller) ---------- */

    onStart(golden) {
      this.el.classList.remove('is-cashed', 'is-popped');
      this.el.classList.add('is-filling');
      this.el.classList.toggle('is-golden', golden);
      this.r.wrap.className = 'balloon-wrap';
      this.r.result.className = 'result';
      this.r.result.textContent = '';
      this.setInputsLocked(true);
    }

    onPop(result) {
      this.el.classList.remove('is-filling');
      this.el.classList.add('is-popped');
      this.r.wrap.classList.add('popped');
      this.r.mult.textContent = mult(result.multiplier);
      this.showResult(`Popped!`, `-${money(this.slot.bet)}`, 'lose');
      this.r.stage.classList.remove('shake');
      void this.r.stage.offsetWidth;
      this.r.stage.classList.add('shake');
      this.addHistory(result.multiplier, false);
    }

    onCashout(result) {
      this.el.classList.remove('is-filling');
      this.el.classList.add('is-cashed');
      this.r.wrap.classList.add('released');
      this.r.mult.textContent = mult(result.multiplier);
      const title = result.capped && this.slot.golden ? `Max win ${mult(result.multiplier)}`
        : `${result.auto ? 'Auto ' : ''}Cashed ${mult(result.multiplier)}`;
      this.showResult(title, `+${money(result.payout)}`, 'win');
      this.addHistory(result.multiplier, true);
    }

    onReset() {
      this.el.classList.remove('is-filling', 'is-cashed', 'is-popped', 'is-golden');
      this.r.wrap.className = 'balloon-wrap spawn';
      this.r.result.className = 'result';
      this.r.stage.classList.remove('shake');
      this.setInputsLocked(false);
    }

    showResult(title, amount, kind) {
      this.r.result.innerHTML = `<b>${title}</b><span>${amount}</span>`;
      this.r.result.className = `result show ${kind}`;
    }

    addHistory(m, won) {
      const chip = document.createElement('span');
      chip.className = `hchip ${won ? 'win' : 'lose'}`;
      chip.textContent = mult(m);
      this.r.history.prepend(chip);
      while (this.r.history.children.length > HISTORY_MAX) this.r.history.lastChild.remove();
    }

    /* ---------- per-frame render ---------- */

    render(now, particles) {
      const s = this.slot;
      const m = s.multiplier;
      let scale;
      let tx = 0;
      let ty = 0;
      let rot = 0;

      if (s.isFilling) {
        scale = sizeFor(m);
        // Tension wobble grows with size — purely cosmetic, reveals nothing about the pop time.
        const k = clamp(Math.log(m) / Math.log(20), 0, 1);
        const amp = 0.6 + k * 3.2;
        tx = Math.sin(now / 37) * amp * 0.6 + Math.sin(now / 91) * amp * 0.4;
        rot = Math.sin(now / 420) * (2 + k * 2);
        ty = Math.sin(now / 53) * amp * 0.3;
        const text = mult(floor2(m));
        if (text !== this.lastMultText) {
          this.r.mult.textContent = text;
          this.lastMultText = text;
        }
        if (s.golden && particles && now > this.nextGlitter) {
          const c = this.center;
          particles.glitter(c.x, c.y, c.radius);
          this.nextGlitter = now + 70;
        }
      } else if (s.isIdle) {
        scale = sizeFor(1);
        ty = Math.sin(now / 650 + s.id) * 5;
        rot = Math.sin(now / 900 + s.id) * 3;
        if (this.lastMultText !== '1.00x') {
          this.r.mult.textContent = '1.00x';
          this.lastMultText = '1.00x';
        }
      } else {
        scale = sizeFor(m);
        this.lastMultText = '';
      }

      this.r.balloon.style.transform =
        `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(4)})`;

      const tier = tierFor(m);
      if (tier !== this.lastTier) {
        this.r.mult.classList.remove(this.lastTier || 'x');
        this.r.mult.classList.add(tier);
        this.lastTier = tier;
      }
      this.renderAction();
    }

    renderAction() {
      const s = this.slot;
      const btn = this.r.action;
      let label;
      let sub;
      let mode;
      if (s.isIdle) {
        label = 'Start Fill';
        sub = `Bet ${money(this.bet)}`;
        mode = 'start';
      } else if (s.isFilling) {
        label = 'Cash Out';
        sub = money(s.potentialWin);
        mode = 'cash';
      } else {
        label = s.state === 'cashed' ? 'Cashed Out' : 'Popped';
        sub = s.state === 'cashed' ? `+${money(s.result.payout)}` : 'Refilling…';
        mode = 'done';
      }
      if (btn.dataset.mode !== mode) {
        btn.dataset.mode = mode;
        btn.disabled = mode === 'done';
      }
      if (this.r.actionLabel.textContent !== label) this.r.actionLabel.textContent = label;
      if (this.r.actionSub.textContent !== sub) this.r.actionSub.textContent = sub;
    }
  }

  BF.BalloonView = BalloonView;
})();
