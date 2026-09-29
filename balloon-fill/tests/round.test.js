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
  engine.update(C.BETTING_MS);
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
  engine.update(C.BETTING_MS);
  assert.equal(engine.balloons[0].golden, true);
});

test('a golden balloon that survives to the cap ends as "maxed"', async () => {
  const { engine, log } = await engineWith([buildBalloon(500, true), buildBalloon(1, false)]);
  const launch = C.BETTING_MS + C.REVEAL_MS;
  engine.update(launch + timeFor(C.GOLDEN_CAP, C.GOLDEN_SPEED) + 1);
  assert.equal(engine.balloons[0].state, 'maxed');
  assert.equal(engine.balloons[0].multiplier, C.GOLDEN_CAP);
  assert.ok(log.includes('end0:maxed'));
});

test('a long background gap catches up in one update', async () => {
  const { engine } = await engineWith([buildBalloon(2, false), buildBalloon(2, false)]);
  engine.update(10 * 60 * 1000);
  assert.equal(engine.phase, 'betting');
  assert.equal(engine.roundNo, 2);
});
