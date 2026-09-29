/**
 * Player balance. All money math is rounded to cents here. A real backend
 * would make this a thin client over authoritative server balances.
 */
(function () {
  const { Emitter, round2 } = BF.util;

  class Wallet extends Emitter {
    constructor(balance) {
      super();
      this.balance = round2(balance);
    }
    canAfford(amount) { return amount <= this.balance + 1e-9; }
    debit(amount) {
      if (!this.canAfford(amount)) return false;
      this.balance = round2(this.balance - amount);
      this.emit('change', { balance: this.balance, delta: -amount });
      return true;
    }
    credit(amount) {
      this.balance = round2(this.balance + amount);
      this.emit('change', { balance: this.balance, delta: amount });
    }
  }

  BF.Wallet = Wallet;
})();
