const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./load');

const BF = loadGame();

const win = (over = {}) => Object.assign({ won: true, multiplier: 2, payout: 20, bet: 10, auto: false, golden: false, streak: 1 }, over);

test('each day gets 3 distinct missions, the same for everyone', () => {
  const a = new BF.Rewards({}, '2026-09-29');
  const b = new BF.Rewards({}, '2026-09-29');
  assert.equal(a.missions.length, 3);
  assert.equal(new Set(a.missions.map((m) => m.id)).size, 3);
  assert.deepEqual(a.missions, b.missions);
});

test('missions reset on a new day but not on reload the same day', () => {
  const r = new BF.Rewards({}, '2026-09-29');
  r.recordRound(win());
  const saved = JSON.parse(JSON.stringify(r.toJSON()));
  const sameDay = new BF.Rewards(saved, '2026-09-29');
  assert.deepEqual(sameDay.missions, r.missions);
  const nextDay = new BF.Rewards(saved, '2026-09-30');
  assert.ok(nextDay.missions.every((m) => m.progress === 0 && !m.claimed));
});

test('daily bonus grows on consecutive days, resets after a gap, and caps', () => {
  const r = new BF.Rewards({}, '2026-09-01');
  assert.equal(r.claimBonus(), 100);
  assert.equal(r.claimBonus(), 0); // once per day
  r.rollover('2026-09-02');
  assert.equal(r.claimBonus(), 150);
  r.rollover('2026-09-04'); // missed a day
  assert.equal(r.claimBonus(), 100);
  for (let d = 5; d <= 20; d++) {
    r.rollover(`2026-09-${String(d).padStart(2, '0')}`);
    r.claimBonus();
  }
  assert.equal(r.bonusAmount(), 500); // tomorrow's amount once today is claimed
  r.rollover('2026-09-21');
  assert.equal(r.claimBonus(2), 1000); // level perk multiplier
});

test('bonus streak continues across a month boundary', () => {
  const r = new BF.Rewards({}, '2026-09-30');
  r.claimBonus();
  r.rollover('2026-10-01');
  assert.equal(r.nextBonusStreak, 2);
});

test('mission progress, completion event and single claim', () => {
  const r = new BF.Rewards({}, '2026-09-29');
  r.missions = [{ id: 'high3', progress: 0, claimed: false }];
  const completed = [];
  r.on('complete', (def) => completed.push(def.id));

  r.recordRound(win({ multiplier: 3.5 }));
  r.recordRound(win({ multiplier: 1.5 })); // below 3x, doesn't count
  r.recordRound(win({ won: false, payout: 0, multiplier: 4 })); // popped, doesn't count
  assert.equal(r.missions[0].progress, 1);
  assert.equal(r.claimMission('high3'), null); // not complete yet

  r.recordRound(win({ multiplier: 3 }));
  r.recordRound(win({ multiplier: 12 }));
  assert.deepEqual(completed, ['high3']);
  assert.deepEqual(r.claimMission('high3'), { chips: 250, xp: 100 });
  assert.equal(r.claimMission('high3'), null);
});

test('records track wins, best multiplier and net profit', () => {
  const r = new BF.Rewards({}, '2026-09-29');
  r.recordRound(win({ multiplier: 2.5, payout: 25 }));
  r.recordRound(win({ won: false, payout: 0, multiplier: 1.2 }));
  r.recordRound(win({ multiplier: 10, payout: 50, bet: 5, golden: true }));
  assert.deepEqual(r.stats, { rounds: 3, wins: 2, goldens: 1, biggestWin: 50, bestMultiplier: 10, profit: 50 });
});

test('progress levels up and reports unlocks', () => {
  const p = new BF.Progress();
  const ups = [];
  p.on('levelup', (e) => ups.push(e.level));
  p.addXp(BF.Progress.xpForLevel(1) + BF.Progress.xpForLevel(2));
  assert.deepEqual(ups, [2, 3]);
  assert.equal(p.xp, 0);
  assert.equal(p.xpBoost, 0.05);
});
