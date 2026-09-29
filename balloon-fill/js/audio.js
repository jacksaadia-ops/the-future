/**
 * Sound effects. Every sound is synthesized with the Web Audio API so the game
 * ships without asset files. To use recorded sounds instead, call
 *   BF.sound.useFile('pop', 'sounds/pop.mp3')
 * and that name will play the file rather than the synth.
 *
 * Named effects: inflate (looping, per balloon), cashout, pop, golden, start,
 * levelup, click.
 */
(function () {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = true;
  const files = {};
  const loops = {}; // inflate loops keyed by balloon id

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const d = noiseBuffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function env(gainNode, t, attack, peak, decay) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function tone(freq, t, { type = 'sine', dur = 0.25, vol = 0.2, slideTo = null } = {}) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env(g, t, 0.01, vol, dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(t, { dur = 0.3, vol = 0.5, type = 'lowpass', freq = 2000, q = 0.7 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    env(g, t, 0.003, vol, dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  const synth = {
    click() { tone(900, ctx.currentTime, { type: 'triangle', dur: 0.05, vol: 0.08 }); },
    start() {
      const t = ctx.currentTime;
      tone(220, t, { type: 'triangle', dur: 0.18, vol: 0.15, slideTo: 440 });
      noise(t, { dur: 0.15, vol: 0.12, type: 'bandpass', freq: 1200, q: 2 });
    },
    cashout() {
      const t = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.07, { type: 'triangle', dur: 0.35, vol: 0.18 }));
      [2093, 2637].forEach((f, i) => tone(f, t + 0.3 + i * 0.06, { type: 'sine', dur: 0.3, vol: 0.06 }));
    },
    pop() {
      const t = ctx.currentTime;
      noise(t, { dur: 0.25, vol: 0.9, type: 'lowpass', freq: 3500 });
      noise(t, { dur: 0.08, vol: 0.6, type: 'highpass', freq: 4000 });
      tone(160, t, { type: 'sine', dur: 0.25, vol: 0.5, slideTo: 40 });
    },
    golden() {
      const t = ctx.currentTime;
      [1318.5, 1568, 1975.5, 2637].forEach((f, i) => tone(f, t + i * 0.05, { type: 'sine', dur: 0.4, vol: 0.09 }));
    },
    levelup() {
      const t = ctx.currentTime;
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.09, { type: 'square', dur: 0.22, vol: 0.06 }));
    },
  };

  BF.sound = {
    get enabled() { return enabled; },
    setEnabled(on) {
      enabled = on;
      if (!on) Object.keys(loops).forEach((id) => this.stopInflate(id));
    },
    /** Must be called from a user gesture once so browsers allow audio. */
    unlock() { if (enabled) ensure(); },
    useFile(name, url) { files[name] = url; },

    /** Haptic feedback on phones; follows the sound toggle. */
    vibrate(pattern) {
      if (enabled && navigator.vibrate) {
        try { navigator.vibrate(pattern); } catch (e) { /* unsupported */ }
      }
    },

    play(name) {
      if (!enabled) return;
      if (files[name]) {
        const a = new Audio(files[name]);
        a.volume = 0.7;
        a.play().catch(() => {});
        return;
      }
      if (!ensure() || !synth[name]) return;
      synth[name]();
    },

    /** Starts the looping air-hiss + rising tone for one balloon. */
    startInflate(id) {
      if (!enabled || !ensure() || loops[id]) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 500;
      bp.Q.value = 1.4;
      const ng = ctx.createGain();
      ng.gain.value = 0.0001;
      ng.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.15);
      src.connect(bp).connect(ng).connect(master);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 140;
      const og = ctx.createGain();
      og.gain.value = 0.0001;
      og.gain.exponentialRampToValueAtTime(0.025, ctx.currentTime + 0.2);
      osc.connect(og).connect(master);

      src.start();
      osc.start();
      loops[id] = { src, bp, ng, osc, og };
    },

    /** Maps the multiplier to pitch so the hiss "tightens" as it grows. */
    updateInflate(id, multiplier) {
      const l = loops[id];
      if (!l) return;
      const k = Math.log(multiplier);
      const t = ctx.currentTime;
      l.bp.frequency.setTargetAtTime(500 + 420 * k, t, 0.05);
      l.osc.frequency.setTargetAtTime(140 + 90 * k, t, 0.05);
    },

    stopInflate(id) {
      const l = loops[id];
      if (!l) return;
      const t = ctx.currentTime;
      l.ng.gain.setTargetAtTime(0.0001, t, 0.03);
      l.og.gain.setTargetAtTime(0.0001, t, 0.03);
      l.src.stop(t + 0.2);
      l.osc.stop(t + 0.2);
      delete loops[id];
    },
  };
})();
