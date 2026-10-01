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
  const C = BF.CONFIG;
  const { Emitter, floor2, payout } = BF.util;

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
      const winCap = this.winCap(cap);
      const target = Math.min(this.autoTarget || Infinity, winCap);
      if (target < cap) {
        const t = balloon.timeFor(target);
        if (t <= elapsed && t <= balloon.endTimeMs) {
          this._win(target, true, target === winCap && target !== this.autoTarget);
          return;
        }
      }
      if (balloon.state === 'maxed') this._win(cap, true, true);
      else if (balloon.state === 'popped') this._lose(balloon.multiplier);
    }

    /** Manual cash-out at the balloon's current multiplier. */
    cashOut(balloon) {
      if (!this.canCashOut(balloon)) return false;
      this._win(Math.min(floor2(balloon.multiplier), this.winCap(balloon.maxMultiplier)), false, false);
      return true;
    }

    /** Manual cash-out opens at MIN_CASHOUT, so it always pays more than the stake. */
    canCashOut(balloon) {
      return this.isActive && !!balloon && balloon.isFilling && floor2(balloon.multiplier) >= C.MIN_CASHOUT;
    }

    /** Highest multiplier this bet can be paid: the balloon's maximum or MAX_WIN ÷ stake. */
    winCap(max = C.MAX_MULTIPLIER) {
      return this.amount > 0 ? Math.min(max, floor2(C.MAX_WIN / this.amount)) : max;
    }

    potentialWin(balloon) {
      return balloon ? payout(this.amount, Math.max(1, Math.min(floor2(balloon.multiplier), this.winCap(balloon.maxMultiplier)))) : this.amount;
    }

    _win(multiplier, auto, capped) {
      this.status = 'cashed';
      this.result = { won: true, multiplier, payout: payout(this.amount, multiplier), auto, capped };
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
