/**
 * BetSlot — the local player's bet on one balloon (no DOM).
 *
 * status: none → placed (betting window, cancellable) → active (locked in)
 *         → cashed | lost → none (when the next betting window opens)
 * A separate `queued` bet can be set while a round is running; the controller
 * places it automatically when the next betting window opens.
 *
 * Events: 'placed', 'cancelled', 'activated', 'cashout' {multiplier, payout, auto, capped},
 *         'lost' {multiplier}
 */
(function () {
  const { Emitter, floor2, round2 } = BF.util;

  class BetSlot extends Emitter {
    constructor(index) {
      super();
      this.index = index;
      this.status = 'none';
      this.amount = 0;
      this.autoTarget = null;
      this.queued = null;
      this.result = null;
    }

    get isActive() { return this.status === 'active'; }

    place(amount, autoTarget) {
      if (this.status !== 'none') return false;
      this.status = 'placed';
      this.amount = amount;
      this.autoTarget = autoTarget && autoTarget > 1 ? autoTarget : null;
      this.result = null;
      this.emit('placed', { amount });
      return true;
    }

    cancel() {
      if (this.status !== 'placed') return false;
      const { amount } = this;
      this.status = 'none';
      this.amount = 0;
      this.emit('cancelled', { amount });
      return true;
    }

    /** Called when bets lock. */
    activate() {
      if (this.status !== 'placed') return false;
      this.status = 'active';
      this.emit('activated', { amount: this.amount });
      return true;
    }

    /** Clears last round's result before a new betting window. */
    clear() {
      if (this.status === 'cashed' || this.status === 'lost') {
        this.status = 'none';
        this.amount = 0;
        this.result = null;
      }
    }

    /**
     * Settles auto cash-out / pop / cap against the shared balloon.
     * `elapsed` is ms since launch; safe to call repeatedly.
     */
    resolve(balloon, elapsed) {
      if (!this.isActive || !balloon) return;
      const cap = balloon.maxMultiplier;
      if (this.autoTarget && this.autoTarget < cap) {
        const t = balloon.timeFor(this.autoTarget);
        if (t <= elapsed && t <= balloon.endTimeMs) {
          this._win(this.autoTarget, true, false);
          return;
        }
      }
      if (balloon.state === 'maxed') this._win(cap, true, true);
      else if (balloon.state === 'popped') this._lose(balloon.multiplier);
    }

    /** Manual cash-out at the balloon's current multiplier. */
    cashOut(balloon) {
      if (!this.isActive || !balloon || !balloon.isFilling) return false;
      this._win(Math.max(1, floor2(balloon.multiplier)), false, false);
      return true;
    }

    potentialWin(balloon) {
      return balloon ? round2(this.amount * Math.max(1, floor2(balloon.multiplier))) : this.amount;
    }

    _win(multiplier, auto, capped) {
      this.status = 'cashed';
      this.result = { won: true, multiplier, payout: round2(this.amount * multiplier), auto, capped };
      this.emit('cashout', this.result);
    }

    _lose(multiplier) {
      this.status = 'lost';
      this.result = { won: false, multiplier: floor2(multiplier), payout: 0 };
      this.emit('lost', this.result);
    }
  }

  BF.BetSlot = BetSlot;
})();
