/**
 * Player balance, kept in integer units of 1/10,000 dollar so a cent stake ×
 * a 2-decimal multiplier is always paid exactly (never rounded to the cent).
 * A real backend would make this a thin client over authoritative server balances.
 */
(function () {
  const { Emitter, toUnits, SCALE } = BF.util;

  class Wallet extends Emitter {
    constructor(balance) {
      super();
      this.units = toUnits(balance);
    }
    get balance() { return this.units / SCALE; }
    canAfford(amount) { return toUnits(amount) <= this.units; }
    debit(amount) {
      if (!this.canAfford(amount)) return false;
      this.units -= toUnits(amount);
      this.emit('change', { balance: this.balance, delta: -amount });
      return true;
    }
    credit(amount) {
      this.units += toUnits(amount);
      this.emit('change', { balance: this.balance, delta: amount });
    }
  }

  BF.Wallet = Wallet;
})();
