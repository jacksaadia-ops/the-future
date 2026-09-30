const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('./load');

const BF = loadGame();
const C = BF.CONFIG;
const { buildBalloon } = BF.outcome;

/** Provider returning scripted rounds. */
function scripted(...rounds) {
  let i = 0;
  return { createRound: async () => ({ id: `s${i}`, balloons: rounds[Math.min(i++, rounds.length - 1)] }) };
}
const flush = () => new Promise((r) => setImmediate(r));
/** The result is derived asynchronously once bets close, so let it settle and update again. */
async function advance(engine, t) {
  engine.update(t);
  await flush();
  engine.update(t);
}
const timeFor = (m, speed = 1) => Math.log(m) / (C.GROWTH_RATE * speed);

async function engineWith(...rounds) {
  const engine = new BF.RoundEngine(scripted(...rounds));
  const log = [];
  ['betting', 'locked', 'launch', 'ended'].forEach((e) => engine.on(e, () => log.push(e)));
  engine.on('balloonEnd', (b) => log.push(`end${b.index}:${b.state}`));
  engine.start(0);
  await flush();
  return { engine, log };
}

test('round runs betting → reveal → flying → ended → next betting', async () => {
  const { engine, log } = await engineWith([buildBalloon(2, false), buildBalloon(3, false)]);
  assert.equal(engine.phase, 'betting');
  engine.update(C.BETTING_MS - 1);
  assert.equal(engine.phase, 'betting');
  await advance(engine, C.BETTING_MS);
  assert.equal(engine.phase, 'reveal');
  const launch = C.BETTING_MS + C.REVEAL_MS;
  engine.update(launch);
  assert.equal(engine.phase, 'flying');
  engine.update(launch + timeFor(2));
  assert.equal(engine.balloons[0].state, 'popped');
  assert.equal(engine.balloons[1].state, 'filling');
  engine.update(launch + timeFor(3));
  assert.equal(engine.phase, 'ended');
  engine.update(launch + timeFor(3) + C.ROUND_END_MS);
  assert.equal(engine.phase, 'betting');
  assert.equal(engine.roundNo, 2);
  assert.deepEqual(log, ['betting', 'locked', 'launch', 'end0:popped', 'end1:popped', 'ended', 'betting']);
});

test('golden is only revealed when bets lock', async () => {
  const { engine } = await engineWith([buildBalloon(2, true), buildBalloon(2, false)]);
  assert.deepEqual(engine.balloons, []); // nothing visible while betting
  await advance(engine, C.BETTING_MS);
  assert.equal(engine.balloons[0].golden, true);
});

test('a golden balloon that survives to the maximum ends as "maxed"', async () => {
  const { engine, log } = await engineWith([buildBalloon(C.MAX_MULTIPLIER, true), buildBalloon(1, false)]);
  const launch = C.BETTING_MS + C.REVEAL_MS;
  const end = new BF.SharedBalloon(0, buildBalloon(C.MAX_MULTIPLIER, true)).endTimeMs; // real time, with the speed-up
  await advance(engine, launch + end + 1);
  assert.equal(engine.balloons[0].state, 'maxed');
  assert.equal(engine.balloons[0].multiplier, C.MAX_MULTIPLIER);
  assert.ok(log.includes('end0:maxed'));
});

test('a long background gap catches up in one update', async () => {
  const { engine } = await engineWith([buildBalloon(2, false), buildBalloon(2, false)]);
  await advance(engine, 10 * 60 * 1000);
  assert.equal(engine.phase, 'betting');
  assert.equal(engine.roundNo, 2);
});
