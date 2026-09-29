/**
 * Shared round engine (no DOM). Every player watches the same balloons.
 *
 *   betting (BETTING_MS) → reveal (REVEAL_MS) → flying → ended (ROUND_END_MS) → betting …
 *
 * - betting: bets can be placed or cancelled. The provider commits to this
 *   round's server seed (its hash is public); the first three bettors'
 *   client seeds are collected.
 * - lock:    the provider derives the result from the server seed + client seeds.
 * - reveal:  bets are locked; golden balloons are revealed.
 * - flying:  both balloons inflate from the same instant; each pops (or hits
 *            its cap) independently. Ends when every balloon has finished.
 * - ended:   results shown, then the next betting window opens.
 *
 * Events: 'betting' {roundNo, closesAt, commitment}, 'locked' {roundNo, balloons},
 *         'launch' {startAt}, 'balloonEnd' SharedBalloon, 'ended' {roundNo}
 *
 * All transitions are timestamped from the schedule, not from when update()
 * happens to run, so a throttled background tab resolves identically.
 */
(function () {
  const C = BF.CONFIG;
  const { Emitter } = BF.util;

  /*
   * Flight clock. Outcomes are defined on a "normal-curve" clock τ where a
   * normal balloon is at e^(r·τ). Past WARP_FROM (τ0) the on-screen clock runs
   * WARP_SPEEDUP× faster, so long flights finish sooner. Every balloon uses the
   * same mapping, so golden and normal balloons with the same pop point still
   * pop at the same real moment, and no pop point or payout changes.
   */
  const WARP_AT = Math.log(C.WARP_FROM) / C.GROWTH_RATE; // τ0 in ms
  const toReal = (tau) => (tau <= WARP_AT ? tau : WARP_AT + (tau - WARP_AT) / C.WARP_SPEEDUP);
  const toClock = (t) => (t <= WARP_AT ? t : WARP_AT + (t - WARP_AT) * C.WARP_SPEEDUP);

  class SharedBalloon {
    constructor(index, outcome) {
      Object.assign(this, outcome);
      this.popTimeMs = toReal(outcome.popTimeMs); // outcome times are on the normal-curve clock
      this.index = index;
      this.state = 'filling'; // filling | popped | maxed
      this.multiplier = 1;
      this.maxes = this.timeFor(this.maxMultiplier) <= this.popTimeMs;
      this.endTimeMs = this.maxes ? this.timeFor(this.maxMultiplier) : this.popTimeMs;
    }

    get isFilling() { return this.state === 'filling'; }

    /** Real time (ms after launch) at which this balloon reaches multiplier m. */
    timeFor(m) { return toReal(Math.log(m) / (C.GROWTH_RATE * this.speed)); }

    multiplierAt(elapsed) {
      const tau = toClock(Math.max(0, elapsed));
      return Math.min(this.maxMultiplier, Math.exp(C.GROWTH_RATE * this.speed * tau));
    }

    /** Advances to `elapsed` ms after launch; returns true if it just finished. */
    update(elapsed) {
      if (!this.isFilling) return false;
      if (elapsed >= this.endTimeMs) {
        this.state = this.maxes ? 'maxed' : 'popped';
        this.multiplier = this.maxes ? this.maxMultiplier : this.popMultiplier;
        return true;
      }
      this.multiplier = this.multiplierAt(elapsed);
      return false;
    }
  }

  class RoundEngine extends Emitter {
    constructor(provider) {
      super();
      this.provider = provider;
      this.phase = 'idle';
      this.roundNo = 0;
      this.balloons = [];
      this.pending = null; // this round's outcome once derived at lock
      this.bettors = []; // first bettors whose client seeds feed the result
      this.history = []; // revealed proofs of past rounds, newest first
    }

    /** Records a bettor's client seed; only the first CLIENT_SEEDS bettors count. */
    addBettor(name, seed) {
      const max = BF.fair ? BF.fair.CLIENT_SEEDS : 3;
      if (this.phase !== 'betting' || this.bettors.length >= max) return;
      if (this.bettors.some((b) => b.name === name)) return;
      this.bettors.push({ name, seed });
    }

    /** The revealed proof for a finished round, if still in history. */
    proofFor(roundNo) { return this.history.find((h) => h.roundNo === roundNo) || null; }

    start(now) { this._beginBetting(now); }

    get elapsed() { return this.phase === 'flying' || this.phase === 'ended' ? this._now - this.startAt : 0; }

    /** Remaining ms in the current phase (for countdowns). */
    remaining(now) {
      if (this.phase === 'betting') return Math.max(0, this.closesAt - now);
      if (this.phase === 'reveal') return Math.max(0, this.startAt - now);
      if (this.phase === 'ended') return Math.max(0, this.nextAt - now);
      return 0;
    }

    update(now) {
      this._now = now;
      for (let guard = 0; guard < 10; guard++) {
        if (!this._step(now)) break;
      }
    }

    /** Performs at most one phase transition; returns true if it did. */
    _step(now) {
      switch (this.phase) {
        case 'betting':
          if (now < this.closesAt) return false;
          if (!this.requested) {
            // Bets are closed: derive the result from the committed seed + collected client seeds.
            this.requested = true;
            const roundNo = this.roundNo;
            this.provider.createRound(this.bettors.slice()).then((round) => {
              if (this.roundNo === roundNo) this.pending = round;
            });
          }
          if (!this.pending) return false;
          this._lock(this.closesAt);
          return true;
        case 'reveal':
          if (now < this.startAt) return false;
          this.phase = 'flying';
          this.emit('launch', { startAt: this.startAt });
          return true;
        case 'flying': {
          const elapsed = now - this.startAt;
          this.balloons.forEach((b) => { if (b.update(elapsed)) this.emit('balloonEnd', b); });
          if (this.balloons.some((b) => b.isFilling)) return false;
          const endAt = this.startAt + Math.max(...this.balloons.map((b) => b.endTimeMs));
          this.phase = 'ended';
          this.nextAt = endAt + C.ROUND_END_MS;
          if (this.round.proof) {
            this.history.unshift({
              roundNo: this.roundNo,
              ...this.round.proof,
              finals: this.balloons.map((b) => ({ multiplier: b.multiplier, state: b.state, golden: b.golden })),
            });
            this.history.length = Math.min(this.history.length, 50);
          }
          this.emit('ended', { roundNo: this.roundNo });
          return true;
        }
        case 'ended':
          if (now < this.nextAt) return false;
          // After a long background gap, open betting "now" rather than in the past.
          this._beginBetting(now - this.nextAt > C.BETTING_MS ? now : this.nextAt);
          return true;
        default:
          return false;
      }
    }

    _beginBetting(t) {
      this.phase = 'betting';
      this.roundNo += 1;
      this.closesAt = t + C.BETTING_MS;
      this.balloons = [];
      this.pending = null;
      this.requested = false;
      this.bettors = [];
      this.commitment = this.provider.commit ? this.provider.commit() : null;
      this.emit('betting', { roundNo: this.roundNo, closesAt: this.closesAt, commitment: this.commitment });
    }

    _lock(t) {
      this.phase = 'reveal';
      this.round = this.pending;
      this.balloons = this.round.balloons.map((o, i) => new SharedBalloon(i, o));
      this.startAt = t + C.REVEAL_MS;
      this.emit('locked', { roundNo: this.roundNo, balloons: this.balloons });
    }
  }

  BF.RoundEngine = RoundEngine;
  BF.SharedBalloon = SharedBalloon;
  BF.flightClock = { toReal, toClock, WARP_AT };
})();
