/**
 * Player progression: XP, levels, perks and skin unlocks.
 * Perks are small permanent benefits granted at level thresholds.
 */
(function () {
  const { Emitter } = BF.util;

  const PERKS = [
    { level: 2, label: 'Streak bonus: +2 XP per win in your streak' },
    { level: 3, label: '+5% XP on every round', xpBoost: 0.05 },
    { level: 5, label: 'Free chips refill raised to $2,000', refill: 2000 },
    { level: 7, label: '+10% XP on every round', xpBoost: 0.1 },
    { level: 10, label: 'Free chips refill raised to $5,000', refill: 5000 },
    { level: 12, label: '+20% XP on every round', xpBoost: 0.2 },
    { level: 15, label: 'Golden Balloon chance 10% → 12%', goldenChance: 0.12 },
    { level: 20, label: 'Golden Balloon chance 12% → 15%', goldenChance: 0.15 },
  ];

  class Progress extends Emitter {
    constructor(saved = {}) {
      super();
      this.level = saved.level || 1;
      this.xp = saved.xp || 0;
    }

    static xpForLevel(level) { return Math.round(120 * Math.pow(level, 1.35)); }
    static get PERKS() { return PERKS; }

    get needed() { return Progress.xpForLevel(this.level); }

    /** Latest value of a perk property among perks already reached. */
    perkValue(key, fallback) {
      let v = fallback;
      PERKS.forEach((p) => { if (p.level <= this.level && p[key] !== undefined) v = p[key]; });
      return v;
    }

    get xpBoost() { return this.perkValue('xpBoost', 0); }
    get refillAmount() { return this.perkValue('refill', BF.CONFIG.STARTING_BALANCE); }
    get goldenChance() { return this.perkValue('goldenChance', BF.CONFIG.GOLDEN_CHANCE); }
    get nextPerk() { return PERKS.find((p) => p.level > this.level) || null; }
    nextSkin() { return BF.SKINS.find((s) => s.level > this.level) || null; }
    isUnlocked(skin) { return skin.level <= this.level; }

    /** XP for one finished balloon round. */
    awardRound({ bet, won, multiplier, streak, golden }) {
      let xp = 8 + Math.min(bet, 500) * 0.25;
      if (won) xp += 6 + Math.min(40, Math.log2(multiplier) * 8);
      if (golden) xp += 10;
      if (won && this.level >= 2) xp += 2 * Math.min(streak, 10);
      xp = Math.round(xp * (1 + this.xpBoost));
      this.addXp(xp);
      return xp;
    }

    addXp(amount) {
      this.xp += amount;
      while (this.xp >= this.needed) {
        this.xp -= this.needed;
        this.level += 1;
        const unlocked = BF.SKINS.filter((s) => s.level === this.level);
        const perks = PERKS.filter((p) => p.level === this.level);
        this.emit('levelup', { level: this.level, unlocked, perks });
      }
      this.emit('change', this);
    }

    toJSON() { return { level: this.level, xp: this.xp }; }
  }

  BF.Progress = Progress;
})();
