/**
 * BalloonSlot — pure game logic for one balloon (no DOM).
 *
 * States: idle → filling → (cashed | popped) → idle
 * Events: 'start', 'cashout' {multiplier, payout, auto, capped}, 'pop' {multiplier}, 'reset'
 *
 * A balloon that reaches its round's maxMultiplier (the Golden Balloon cap)
 * is cashed out automatically at that multiplier.
 *
 * The multiplier is a deterministic function of elapsed time, so a paused tab
 * resolves correctly when it wakes up (auto cash-out wins if its target was
 * reached before the pop time).
 */
(function () {
  const C = BF.CONFIG;
  const { Emitter, floor2, round2 } = BF.util;

  class BalloonSlot extends Emitter {
    constructor(id) {
      super();
      this.id = id;
      this.reset(true);
    }

    reset(silent) {
      this.state = 'idle';
      this.round = null;
      this.bet = 0;
      this.autoTarget = null;
      this.startedAt = 0;
      this.multiplier = 1;
      this.result = null;
      if (!silent) this.emit('reset');
    }

    get isFilling() { return this.state === 'filling'; }
    get isIdle() { return this.state === 'idle'; }
    get golden() { return !!(this.round && this.round.golden); }

    multiplierAt(elapsedMs) {
      const speed = this.round ? this.round.speed : 1;
      const cap = this.round ? this.round.maxMultiplier : C.MAX_MULTIPLIER;
      return Math.min(cap, Math.exp(C.GROWTH_RATE * speed * Math.max(0, elapsedMs)));
    }

    /** Time (ms) at which this balloon's multiplier reaches `m`. */
    timeFor(m) { return Math.log(m) / (C.GROWTH_RATE * this.round.speed); }

    start(round, bet, autoTarget, now) {
      if (!this.isIdle) return false;
      this.round = round;
      this.bet = bet;
      this.autoTarget = autoTarget && autoTarget > 1 ? autoTarget : null;
      this.startedAt = now;
      this.multiplier = 1;
      this.state = 'filling';
      this.emit('start', { golden: round.golden });
      return true;
    }

    /** Advances the balloon; resolves auto cash-out and pops. */
    update(now) {
      if (!this.isFilling) return;
      const elapsed = now - this.startedAt;
      const { popTimeMs } = this.round;

      // Auto cash-out fires at the player's target or the round cap, whichever comes first.
      const cap = this.round.maxMultiplier;
      const target = this.autoTarget ? Math.min(this.autoTarget, cap) : cap;
      const tAuto = this.timeFor(target);
      if (elapsed >= tAuto && tAuto <= popTimeMs) {
        this._settleCashout(target, true, target === cap);
        return;
      }
      if (elapsed >= popTimeMs) {
        this.multiplier = this.round.popMultiplier;
        this.state = 'popped';
        this.result = { won: false, multiplier: floor2(this.multiplier), payout: 0 };
        this.emit('pop', this.result);
        return;
      }
      this.multiplier = this.multiplierAt(elapsed);
    }

    /** Manual cash-out. Returns false if the balloon already resolved. */
    cashOut(now) {
      if (!this.isFilling) return false;
      this.update(now); // make sure a pop that already happened wins the race
      if (!this.isFilling) return false;
      this._settleCashout(floor2(this.multiplier), false);
      return true;
    }

    _settleCashout(multiplier, auto, capped = false) {
      this.multiplier = multiplier;
      this.state = 'cashed';
      this.result = { won: true, multiplier, payout: round2(this.bet * multiplier), auto, capped };
      this.emit('cashout', this.result);
    }

    /** What the player would receive if they cashed out right now. */
    get potentialWin() { return round2(this.bet * floor2(this.multiplier)); }
  }

  BF.BalloonSlot = BalloonSlot;
})();
