const test = require('node:test');
const assert = require('node:assert/strict');
const nodeCrypto = require('crypto');
const { loadGame } = require('./load');

const BF = loadGame();
const C = BF.CONFIG;
const F = BF.fair;

const seeds = (...s) => s.map((seed, i) => ({ name: `P${i + 1}`, seed }));
const flush = () => new Promise((r) => setImmediate(r));

test('SHA-256 matches the standard test vectors and Node crypto', () => {
  assert.equal(F.sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(F.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (let i = 0; i < 300; i++) {
    const s = nodeCrypto.randomBytes(i).toString('base64') + (i % 7 === 0 ? ' 🎈 é' : '');
    assert.equal(F.sha256(s), nodeCrypto.createHash('sha256').update(s, 'utf8').digest('hex'));
  }
});

test('the committed hash is published before the result and matches the revealed seed', () => {
  const provider = new F.FairRoundProvider({ rtp: 0.97 });
  const { serverSeedHash } = provider.commit();
  const round = provider.createRoundSync(seeds('alice', 'bob', 'carol'));
  assert.equal(round.proof.serverSeedHash, serverSeedHash);
  assert.equal(F.sha256(round.proof.serverSeed), serverSeedHash);
});

test('the next round\'s hash is shown in advance and then used', () => {
  const provider = new F.FairRoundProvider();
  const announced = provider.nextServerSeedHash;
  assert.equal(provider.commit().serverSeedHash, announced);
});

test('results are fully determined by the seeds and verify() reproduces them', () => {
  const provider = new F.FairRoundProvider({ rtp: 0.97 });
  const round = provider.createRoundSync(seeds('alice', 'bob', 'carol'));
  const check = F.verify(round.proof);
  assert.equal(check.ok, true);
  check.steps.forEach((s, i) => {
    assert.equal(s.popPoint, round.proof.results[i].popPoint);
    assert.equal(s.hash, nodeCrypto.createHash('sha256').update(F.hashInput(round.proof.serverSeed, ['alice', 'bob', 'carol'], i)).digest('hex'));
  });
  // Same inputs → same result, every time.
  assert.deepEqual(F.deriveRound(round.proof.serverSeed, ['alice', 'bob', 'carol'], 0.97).map((s) => s.popPoint),
    round.proof.results.map((r) => r.popPoint));
});

test('verify() catches a swapped server seed, client seed or result', () => {
  const provider = new F.FairRoundProvider();
  const proof = provider.createRoundSync(seeds('a', 'b', 'c')).proof;
  assert.equal(F.verify({ ...proof, serverSeed: F.newServerSeed() }).hashOk, false);
  assert.equal(F.verify({ ...proof, clientSeeds: seeds('a', 'b', 'x') }).resultsOk, false);
  const results = proof.results.map((r) => ({ ...r }));
  results[0].popPoint += 0.01;
  assert.equal(F.verify({ ...proof, results }).ok, false);
});

test('each client seed changes the outcome', () => {
  const server = F.newServerSeed();
  const base = F.deriveRound(server, ['a', 'b', 'c'], 0.97)[0].hash;
  assert.notEqual(F.deriveRound(server, ['a', 'b', 'd'], 0.97)[0].hash, base);
  assert.notEqual(F.deriveRound(server, ['b', 'a', 'c'], 0.97)[0].hash, base);
});

test('hash-derived outcomes keep the designed odds', () => {
  const provider = new F.FairRoundProvider({ rtp: 0.97 });
  const k = BF.outcome.survivalConstant(0.97);
  const n = 40000;
  let over2 = 0;
  let goldens = 0;
  for (let i = 0; i < n; i++) {
    const r = provider.createRoundSync(seeds(`client-${i}`));
    r.proof.results.forEach((b) => { if (b.popPoint >= 2) over2++; if (b.golden) goldens++; });
  }
  const balloons = n * C.BALLOONS;
  assert.ok(Math.abs(over2 / balloons - k / 2) < 0.01, `P(>=2) ${over2 / balloons}`);
  assert.ok(Math.abs(goldens / balloons - C.GOLDEN_CHANCE) < 0.003, `golden ${goldens / balloons}`);
});

test('engine uses the first three bettors\' seeds and keeps a verifiable history', async () => {
  const engine = new BF.RoundEngine(new F.FairRoundProvider());
  let commitment = null;
  engine.on('betting', (e) => { commitment = commitment || e.commitment; });
  engine.start(0);
  ['Ann', 'Ben', 'Cat', 'Dan'].forEach((name) => engine.addBettor(name, `${name}-seed`));
  engine.addBettor('Ann', 'duplicate-ignored');
  engine.update(C.BETTING_MS);
  await flush();
  engine.update(C.BETTING_MS);
  assert.equal(engine.phase, 'reveal');
  engine.update(C.BETTING_MS + C.REVEAL_MS + 1e7); // run the round to the end
  const proof = engine.proofFor(1);
  assert.ok(proof, 'round 1 proof stored');
  assert.deepEqual(proof.clientSeeds.map((c) => c.name), ['Ann', 'Ben', 'Cat']);
  assert.equal(proof.serverSeedHash, commitment.serverSeedHash);
  assert.equal(F.verify(proof).ok, true);
  const steps = F.verify(proof).steps;
  proof.finals.forEach((f, i) => {
    const expected = f.state === 'maxed' ? steps[i].outcome.maxMultiplier : steps[i].finalMultiplier;
    assert.ok(Math.abs(f.multiplier - expected) < 1e-9, `balloon ${i}: ${f.multiplier} vs ${expected}`);
  });
});
