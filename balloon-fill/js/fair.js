/**
 * Provably fair round generation (no DOM).
 *
 * Every round's result comes from four ingredients:
 *   - the server seed, committed before betting opens by publishing SHA-256(serverSeed)
 *   - the client seeds of the first three players to bet in that round
 *
 * When bets lock, for each balloon i:
 *     hash_i = SHA-256( serverSeed + ":" + clientSeed1 + ":" + clientSeed2 + ":" + clientSeed3 + ":" + i )
 *     u      = first 13 hex digits of hash_i / 2^52      → pop point = floor_to_cent(k / (1 − u)), min 1.00
 *     g      = next 13 hex digits of hash_i / 2^52       → golden if g < GOLDEN_CHANCE
 * After the round the server seed is revealed, so anyone can check it against the
 * committed hash and recompute every balloon (see verify()).
 *
 * In production the server holds the seeds and FairRoundProvider runs server-side;
 * in this play-money build it runs in the browser to demonstrate the flow.
 */
(function () {
  const C = BF.CONFIG;
  const O = BF.outcome;

  /* ---------------- SHA-256 (FIPS 180-4), synchronous, UTF-8 input ---------------- */

  const PRIMES = [];
  for (let n = 2; PRIMES.length < 64; n++) if (PRIMES.every((p) => n % p)) PRIMES.push(n);
  const frac32 = (x) => Math.floor((x - Math.floor(x)) * 2 ** 32) >>> 0;
  const K = PRIMES.map((p) => frac32(Math.cbrt(p)));
  const H0 = PRIMES.slice(0, 8).map((p) => frac32(Math.sqrt(p)));
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  function sha256(message) {
    const bytes = new TextEncoder().encode(message);
    const len = bytes.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor((len * 8) / 2 ** 32));
    dv.setUint32(total - 4, (len * 8) >>> 0);

    const h = H0.slice();
    const w = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i] + v) >>> 0; });
    }
    return h.map((x) => x.toString(16).padStart(8, '0')).join('');
  }

  /* ---------------- seeds ---------------- */

  const ALPHANUM = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

  function randomString(length, alphabet) {
    const cryptoObj = (typeof window !== 'undefined' && window.crypto) || globalThis.crypto;
    const buf = new Uint32Array(length);
    if (cryptoObj && cryptoObj.getRandomValues) cryptoObj.getRandomValues(buf);
    else for (let i = 0; i < length; i++) buf[i] = Math.floor(Math.random() * 2 ** 32);
    // 2^32 is far larger than the alphabet, so the modulo bias is negligible (zero for hex).
    return Array.from(buf, (v) => alphabet[v % alphabet.length]).join('');
  }

  const newServerSeed = () => randomString(64, '0123456789abcdef');
  const newClientSeed = () => randomString(16, ALPHANUM);

  /* ---------------- derivation ---------------- */

  const CLIENT_SEEDS = 3;

  /** The exact string hashed for balloon i. */
  function hashInput(serverSeed, clientSeeds, i) {
    return [serverSeed, ...clientSeeds, i].join(':');
  }

  /** Every step of turning seeds into one balloon, for display and verification. */
  function deriveBalloon(serverSeed, clientSeeds, i, rtp) {
    const input = hashInput(serverSeed, clientSeeds, i);
    const hash = sha256(input);
    const u = parseInt(hash.slice(0, 13), 16) / 2 ** 52;
    const g = parseInt(hash.slice(13, 26), 16) / 2 ** 52;
    const popPoint = O.samplePopPoint(u, O.survivalConstant(rtp));
    const golden = g < C.GOLDEN_CHANCE;
    const outcome = O.buildBalloon(popPoint, golden);
    return { input, hash, u, g, popPoint, golden, finalMultiplier: outcome.popMultiplier, outcome };
  }

  function deriveRound(serverSeed, clientSeeds, rtp) {
    const steps = [];
    for (let i = 0; i < C.BALLOONS; i++) steps.push(deriveBalloon(serverSeed, clientSeeds, i, rtp));
    return steps;
  }

  /**
   * Re-checks a revealed round.
   * proof = { serverSeed, serverSeedHash, clientSeeds: [{name, seed}], rtp, results: [{popPoint, golden}] }
   */
  function verify(proof) {
    const seeds = proof.clientSeeds.map((c) => c.seed);
    const hashOk = sha256(proof.serverSeed) === proof.serverSeedHash;
    const steps = deriveRound(proof.serverSeed, seeds, proof.rtp);
    const resultsOk = steps.every((s, i) => proof.results[i]
      && s.popPoint === proof.results[i].popPoint && s.golden === proof.results[i].golden);
    return { ok: hashOk && resultsOk, hashOk, resultsOk, steps };
  }

  /* ---------------- provider ---------------- */

  let seq = 0;

  /**
   * Stands in for the game server. commit() is called when betting opens,
   * createRound(clientSeeds) when bets lock.
   */
  class FairRoundProvider {
    constructor({ rtp = C.RTP } = {}) {
      this.rtp = rtp;
      this.nextSeed = newServerSeed();
      this.current = null;
    }

    get nextServerSeedHash() { return sha256(this.nextSeed); }

    /** Locks in this round's server seed; returns its public hash (and the next one's). */
    commit() {
      this.current = { seed: this.nextSeed, hash: sha256(this.nextSeed) };
      this.nextSeed = newServerSeed();
      return { serverSeedHash: this.current.hash, nextServerSeedHash: this.nextServerSeedHash };
    }

    /** clientSeeds: [{name, seed}] of the first bettors (up to 3). */
    async createRound(clientSeeds = []) {
      return this.createRoundSync(clientSeeds);
    }

    createRoundSync(clientSeeds = []) {
      if (!this.current) this.commit();
      const { seed, hash } = this.current;
      this.current = null;
      const seeds = clientSeeds.slice(0, CLIENT_SEEDS);
      const steps = deriveRound(seed, seeds.map((c) => c.seed), this.rtp);
      return {
        id: `r${Date.now().toString(36)}-${++seq}`,
        balloons: steps.map((s) => s.outcome),
        proof: {
          serverSeed: seed,
          serverSeedHash: hash,
          clientSeeds: seeds,
          rtp: this.rtp,
          results: steps.map((s) => ({ popPoint: s.popPoint, golden: s.golden })),
        },
      };
    }
  }

  BF.fair = {
    sha256, newServerSeed, newClientSeed, hashInput, deriveBalloon, deriveRound, verify,
    FairRoundProvider, CLIENT_SEEDS,
  };
})();
