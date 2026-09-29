/**
 * Retention systems (no DOM): daily login bonus, daily missions and personal
 * records. Days are local calendar days ('YYYY-MM-DD'); pass `today` in tests.
 */
(function () {
  const { Emitter } = BF.util;

  function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function previousDay(key) {
    const [y, m, d] = key.split('-').map(Number);
    return dayKey(new Date(y, m - 1, d - 1));
  }

  /** Small deterministic hash so everyone gets the same missions on a given day. */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  const BONUS_BASE = 100;
  const BONUS_STEP = 50;
  const BONUS_MAX = 500;
  const MISSIONS_PER_DAY = 3;

  /**
   * Mission pool. `track(round, current)` returns the new progress value.
   * round = { won, multiplier, payout, bet, auto, golden, streak }
   */
  const MISSION_POOL = [
    { id: 'fill20', text: 'Bet on 20 balloons', target: 20, chips: 150, xp: 60, track: (r, p) => p + 1 },
    { id: 'win10', text: 'Win 10 balloons', target: 10, chips: 200, xp: 80, track: (r, p) => p + (r.won ? 1 : 0) },
    { id: 'high3', text: 'Cash out at 3.00x or higher 3 times', target: 3, chips: 250, xp: 100, track: (r, p) => p + (r.won && r.multiplier >= 3 ? 1 : 0) },
    { id: 'streak4', text: 'Reach a 4-win streak', target: 4, chips: 250, xp: 100, track: (r, p) => Math.max(p, r.streak) },
    { id: 'auto5', text: 'Win 5 times with Auto Cash Out', target: 5, chips: 150, xp: 60, track: (r, p) => p + (r.won && r.auto ? 1 : 0) },
    { id: 'profit250', text: 'Make $250 profit from wins', target: 250, chips: 200, xp: 80, track: (r, p) => p + (r.won ? r.payout - r.bet : 0) },
    { id: 'big10', text: 'Cash out at 10.00x or higher', target: 1, chips: 400, xp: 150, track: (r, p) => p + (r.won && r.multiplier >= 10 ? 1 : 0) },
  ];

  function missionsFor(day) {
    const pool = MISSION_POOL.slice();
    let seed = hash(day);
    const picked = [];
    while (picked.length < MISSIONS_PER_DAY) {
      seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
      picked.push(pool.splice(seed % pool.length, 1)[0]);
    }
    return picked.map((m) => ({ id: m.id, progress: 0, claimed: false }));
  }

  class Rewards extends Emitter {
    constructor(saved = {}, today = dayKey()) {
      super();
      this.bonusDay = saved.bonusDay || null;
      this.bonusStreak = saved.bonusStreak || 0;
      this.missionDay = saved.missionDay || null;
      this.missions = saved.missions || [];
      this.stats = Object.assign(
        { rounds: 0, wins: 0, goldens: 0, biggestWin: 0, bestMultiplier: 0, profit: 0 },
        saved.stats,
      );
      this.rollover(today);
    }

    static get POOL() { return MISSION_POOL; }
    static dayKey(date) { return dayKey(date); }

    /** Starts a fresh mission set when the day changes. Returns true if it did. */
    rollover(today = dayKey()) {
      this.today = today;
      if (this.missionDay === today && this.missions.length) return false;
      this.missionDay = today;
      this.missions = missionsFor(today);
      this.emit('change', this);
      return true;
    }

    /* ---------- daily bonus ---------- */

    get canClaimBonus() { return this.bonusDay !== this.today; }

    /**
     * Streak of the next claim: today's if unclaimed, otherwise tomorrow's.
     * The streak continues only when the previous claim was the day before.
     */
    get nextBonusStreak() {
      if (this.bonusDay === this.today) return this.bonusStreak + 1;
      return this.bonusDay === previousDay(this.today) ? this.bonusStreak + 1 : 1;
    }

    bonusAmount(streak = this.nextBonusStreak) {
      return Math.min(BONUS_MAX, BONUS_BASE + BONUS_STEP * (streak - 1));
    }

    /** Claims today's bonus; returns the amount or 0 if already claimed. */
    claimBonus(multiplier = 1) {
      if (!this.canClaimBonus) return 0;
      this.bonusStreak = this.nextBonusStreak;
      this.bonusDay = this.today;
      const amount = this.bonusAmount(this.bonusStreak) * multiplier;
      this.emit('change', this);
      return amount;
    }

    /* ---------- missions + records ---------- */

    missionDef(id) { return MISSION_POOL.find((m) => m.id === id); }

    isComplete(m) { return m.progress >= this.missionDef(m.id).target; }

    /** Feed every finished balloon round in here. */
    recordRound(round) {
      const s = this.stats;
      s.rounds += 1;
      if (round.golden) s.goldens += 1;
      if (round.won) {
        s.wins += 1;
        s.biggestWin = Math.max(s.biggestWin, round.payout);
        s.bestMultiplier = Math.max(s.bestMultiplier, round.multiplier);
      }
      s.profit = Math.round((s.profit + (round.won ? round.payout : 0) - round.bet) * 100) / 100;

      const completed = [];
      this.missions.forEach((m) => {
        if (m.claimed) return;
        const def = this.missionDef(m.id);
        const wasDone = this.isComplete(m);
        m.progress = Math.min(def.target, def.track(round, m.progress));
        if (!wasDone && this.isComplete(m)) completed.push(def);
      });
      completed.forEach((def) => this.emit('complete', def));
      this.emit('change', this);
    }

    /** Claims a completed mission; returns its reward or null. */
    claimMission(id) {
      const m = this.missions.find((x) => x.id === id);
      if (!m || m.claimed || !this.isComplete(m)) return null;
      m.claimed = true;
      const def = this.missionDef(id);
      this.emit('change', this);
      return { chips: def.chips, xp: def.xp };
    }

    toJSON() {
      return {
        bonusDay: this.bonusDay, bonusStreak: this.bonusStreak,
        missionDay: this.missionDay, missions: this.missions, stats: this.stats,
      };
    }
  }

  BF.Rewards = Rewards;
})();
