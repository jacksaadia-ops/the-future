/**
 * BalloonView — renders one shared balloon plus the local player's bet on it,
 * into a card cloned from #balloon-card-tpl. Reads state every frame; all game
 * decisions stay in RoundEngine / BetSlot / the controller.
 */
(function () {
  const { refs, money, mult, clamp, floor2 } = BF.util;
  const HISTORY_MAX = 8;

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
    constructor(index, mount, { bet, auto, autoOn, skin }) {
      this.index = index;
      const tpl = document.getElementById('balloon-card-tpl');
      this.el = tpl.content.firstElementChild.cloneNode(true);
      this.r = refs(this.el);
      this.r.num.textContent = index + 1;
      const C = BF.CONFIG;
      this.r.goldenBanner.innerHTML = `★ Golden<span> · ${C.GOLDEN_SPEED}× speed</span>`;
      this.r.balloon.innerHTML = BF.balloonSVG(`slot${index}`);
      this.r.bet.value = bet.toFixed(2);
      this.r.auto.value = auto.toFixed(2);
      this.r.autoOn.checked = autoOn;
      this.r.bet.id = `bet-${index}`;
      this.r.betLabel.htmlFor = this.r.bet.id;
      this.setSkin(skin);
      mount.appendChild(this.el);

      this.cache = {};
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

    /** Colors used by particle bursts (golden overrides skin). */
    colors(golden) {
      const s = golden ? BF.GOLDEN_SKIN : this.skin;
      return [s.main, s.hi, s.deep];
    }

    /** Viewport coordinates of the balloon's center and its approximate radius. */
    get center() {
      const b = this.r.balloon.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height * 0.45, radius: b.width / 2 };
    }

    /* ---------- round lifecycle hooks (called by the controller) ---------- */

    onBetting() {
      this.el.classList.remove('is-filling', 'is-cashed', 'is-popped', 'is-maxed', 'is-golden', 'is-locked');
      this.r.wrap.className = 'balloon-wrap spawn';
      this.r.result.className = 'result';
      this.r.badge.className = 'cash-badge';
      this.r.stage.classList.remove('shake');
    }

    onLocked(balloon, hasBet) {
      this.el.classList.toggle('is-golden', balloon.golden);
      this.el.classList.toggle('is-locked', hasBet);
    }

    onLaunch() { this.el.classList.add('is-filling'); }

    onCashout(result) {
      this.el.classList.add('is-cashed');
      this.r.badge.innerHTML = `<b>${result.capped ? 'Max win' : 'Cashed'} ${mult(result.multiplier)}</b><span>won ${money(result.payout)}</span>`;
      this.r.badge.className = 'cash-badge show';
    }

    /** The shared balloon popped or hit its cap. `bet` is the player's result, if any. */
    onBalloonEnd(balloon, bet, roundNo) {
      this.el.classList.remove('is-filling');
      let sub = '';
      if (bet && bet.won) sub = `<span class="win">You won +${money(bet.payout)}</span>`;
      else if (bet) sub = `<span class="lose">-${money(bet.lost)}</span>`;

      if (balloon.state === 'maxed') {
        this.el.classList.add('is-maxed');
        this.r.wrap.classList.add('released');
        this.showResult(`Max ${mult(balloon.multiplier)}`, sub, 'win');
      } else {
        this.el.classList.add('is-popped');
        this.r.wrap.classList.add('popped');
        this.showResult(`Popped ${mult(floor2(balloon.multiplier))}`, sub, 'lose');
        this.r.stage.classList.remove('shake');
        void this.r.stage.offsetWidth;
        this.r.stage.classList.add('shake');
      }
      this.addHistory(balloon, roundNo);
    }

    showResult(title, sub, kind) {
      this.r.result.innerHTML = `<b>${title}</b>${sub}`;
      this.r.result.className = `result show ${kind}`;
    }

    addHistory(balloon, roundNo) {
      const chip = document.createElement('button');
      const m = floor2(balloon.multiplier);
      chip.type = 'button';
      chip.className = `hchip ${balloon.golden ? 'gold' : m >= 2 ? 'win' : 'lose'}`;
      chip.textContent = mult(m);
      chip.dataset.round = roundNo;
      chip.title = `Round #${roundNo} — verify`;
      this.r.history.prepend(chip);
      while (this.r.history.children.length > HISTORY_MAX) this.r.history.lastChild.remove();
    }

    /* ---------- per-frame render ---------- */

    /**
     * view state: { phase, remaining, balloon, crowd: {count,total}, action: {mode,label,sub,disabled}, inputsLocked }
     */
    render(now, s, particles) {
      const b = s.balloon;
      let m = 1;
      let scale = sizeFor(1);
      let tx = 0;
      let ty = 0;
      let rot = 0;

      if (b && s.phase !== 'reveal') m = b.multiplier;

      if (b && b.isFilling && s.phase === 'flying') {
        scale = sizeFor(m);
        // Tension wobble grows with size — cosmetic only, reveals nothing about the pop time.
        const k = clamp(Math.log(m) / Math.log(20), 0, 1);
        const amp = 0.6 + k * 3.2;
        tx = Math.sin(now / 37) * amp * 0.6 + Math.sin(now / 91) * amp * 0.4;
        rot = Math.sin(now / 420) * (2 + k * 2);
        ty = Math.sin(now / 53) * amp * 0.3;
        if (b.golden && particles && now > this.nextGlitter) {
          const c = this.center;
          particles.glitter(c.x, c.y, c.radius);
          this.nextGlitter = now + 70;
        }
      } else if (b && !b.isFilling) {
        scale = sizeFor(m);
      } else {
        ty = Math.sin(now / 650 + this.index) * 5;
        rot = Math.sin(now / 900 + this.index) * 3;
      }

      this.r.balloon.style.transform =
        `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(4)})`;

      this.set('mult', 'textContent', mult(floor2(m)));
      this.setClass('mult', 'tier', tierFor(m));
      this.el.classList.toggle('is-waiting', s.phase === 'betting' || s.phase === 'reveal');

      let pill = '';
      if (s.phase === 'betting') pill = `Bets close in ${(s.remaining / 1000).toFixed(1)}s`;
      else if (s.phase === 'reveal') pill = b && b.golden ? '★ Golden balloon!' : 'Bets locked';
      else if (s.phase === 'ended') pill = `Next round in ${Math.ceil(s.remaining / 1000)}s`;
      this.set('phasePill', 'textContent', pill);
      this.setClass('phasePill', 'state', pill ? `show ${s.phase}` : '');

      this.set('crowd', 'textContent', `${s.crowd.count} bets · ${money(s.crowd.total)}`);

      const a = s.action;
      this.set('action', 'dataset.mode', a.mode);
      this.set('action', 'disabled', !!a.disabled);
      this.set('actionLabel', 'textContent', a.label);
      this.set('actionSub', 'textContent', a.sub);
      if (this.cache.locked !== s.inputsLocked) {
        this.cache.locked = s.inputsLocked;
        this.setInputsLocked(s.inputsLocked);
      }
    }

    /** Writes a DOM property only when it changed (cheap per-frame updates). */
    set(ref, prop, value) {
      const key = `${ref}.${prop}`;
      if (this.cache[key] === value) return;
      this.cache[key] = value;
      if (prop.startsWith('dataset.')) this.r[ref].dataset[prop.slice(8)] = value;
      else this.r[ref][prop] = value;
    }

    /** Swaps one class out of a named group on a ref. */
    setClass(ref, group, cls) {
      const key = `${ref}.class.${group}`;
      const prev = this.cache[key];
      if (prev === cls) return;
      const el = this.r[ref];
      if (prev) prev.split(' ').forEach((c) => el.classList.remove(c));
      if (cls) cls.split(' ').forEach((c) => el.classList.add(c));
      this.cache[key] = cls;
    }
  }

  BF.BalloonView = BalloonView;
})();
