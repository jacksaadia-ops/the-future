/**
 * Canvas particle system drawn on a fixed full-screen overlay.
 * Coordinates are CSS pixels relative to the viewport.
 */
(function () {
  const MAX_PARTICLES = 700;
  const { rand, pick } = BF.util;

  class ParticleSystem {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.items = [];
      this.last = performance.now();
      this.resize = this.resize.bind(this);
      window.addEventListener('resize', this.resize);
      this.resize();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.canvas.width = Math.round(window.innerWidth * dpr);
      this.canvas.height = Math.round(window.innerHeight * dpr);
    }

    add(p) {
      if (this.items.length >= MAX_PARTICLES) this.items.shift();
      this.items.push(Object.assign({ life: 1, age: 0, rot: 0, vr: 0, drag: 0.985, gravity: 0, alpha: 1 }, p));
    }

    /** Rubber shards + shockwave + sparks for a popping balloon. */
    pop(x, y, colors, scale = 1) {
      this.add({ kind: 'ring', x, y, r: 10 * scale, grow: 190 * scale, life: 0.45, color: colors[0], width: 6 });
      this.add({ kind: 'ring', x, y, r: 4, grow: 120 * scale, life: 0.35, color: '#ffffff', width: 3 });
      this.add({ kind: 'flash', x, y, r: 140 * scale, life: 0.18, color: colors[0] });
      for (let i = 0; i < 46; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(180, 620) * scale;
        this.add({
          kind: 'shard', x: x + Math.cos(a) * 30 * scale, y: y + Math.sin(a) * 30 * scale,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, gravity: 900, drag: 0.96,
          size: rand(6, 16) * scale, rot: rand(0, 6), vr: rand(-14, 14),
          life: rand(0.8, 1.5), color: pick(colors),
        });
      }
      for (let i = 0; i < 40; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(100, 520) * scale;
        this.add({
          kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 0.93,
          size: rand(1.5, 3.5), life: rand(0.3, 0.7), color: pick(['#ffffff', colors[0], colors[1]]),
        });
      }
    }

    /** Coins and glitter rising from a cashed-out balloon. */
    cashout(x, y, golden) {
      const palette = golden ? ['#ffe27a', '#ffc933', '#fff4c2'] : ['#39ffa0', '#b6ffd9', '#ffe27a'];
      this.add({ kind: 'ring', x, y, r: 8, grow: 130, life: 0.5, color: palette[0], width: 4 });
      for (let i = 0; i < 26; i++) {
        this.add({
          kind: 'coin', x: x + rand(-30, 30), y: y + rand(-10, 20),
          vx: rand(-260, 260), vy: rand(-720, -320), gravity: 1100, drag: 0.99,
          size: rand(6, 10), rot: rand(0, 6), vr: rand(-10, 10), life: rand(1.1, 1.7),
          color: '#ffcf3a',
        });
      }
      for (let i = 0; i < 34; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(80, 380);
        this.add({
          kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, drag: 0.94,
          size: rand(1.5, 3), life: rand(0.4, 0.9), color: pick(palette),
        });
      }
    }

    /** Ambient sparkle for golden balloons (called a few times per second). */
    glitter(x, y, radius) {
      const a = rand(0, Math.PI * 2);
      const r = rand(0.2, 1) * radius;
      this.add({
        kind: 'star', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
        vx: rand(-20, 20), vy: rand(-60, -20), size: rand(3, 7), life: rand(0.5, 1),
        color: pick(['#fff6c9', '#ffd84d', '#ffffff']),
      });
    }

    confetti(x, y) {
      const colors = ['#ff2e88', '#1fc8ff', '#39ffa0', '#ffd84d', '#a36bff'];
      for (let i = 0; i < 80; i++) {
        this.add({
          kind: 'shard', x: x + rand(-80, 80), y, vx: rand(-420, 420), vy: rand(-900, -300),
          gravity: 900, drag: 0.985, size: rand(5, 9), rot: rand(0, 6), vr: rand(-12, 12),
          life: rand(1.4, 2.2), color: pick(colors),
        });
      }
    }

    step(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (!this.items.length) return;

      const alive = [];
      for (const p of this.items) {
        p.age += dt;
        if (p.age >= p.life) continue;
        alive.push(p);
        const t = p.age / p.life;
        if (p.vx !== undefined) {
          p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
        }
        p.rot += p.vr * dt;
        ctx.globalAlpha = Math.max(0, 1 - t * t);

        switch (p.kind) {
          case 'ring':
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.width * (1 - t);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r + p.grow * easeOut(t), 0, Math.PI * 2);
            ctx.stroke();
            break;
          case 'flash': {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
            g.addColorStop(0, 'rgba(255,255,255,0.9)');
            g.addColorStop(0.4, p.color);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          case 'shard':
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.moveTo(-p.size / 2, -p.size / 3);
            ctx.lineTo(p.size / 2, -p.size / 4);
            ctx.lineTo(p.size / 4, p.size / 3);
            ctx.lineTo(-p.size / 3, p.size / 4);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            break;
          case 'coin':
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.scale(Math.abs(Math.cos(p.rot)) + 0.15, 1);
            ctx.fillStyle = '#ffcf3a';
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#b8860b';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = '#fff3b0';
            ctx.beginPath();
            ctx.arc(-p.size * 0.3, -p.size * 0.3, p.size * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            break;
          case 'star':
            drawStar(ctx, p.x, p.y, p.size * (1 - Math.abs(t - 0.5)), p.color);
            break;
          default: // spark
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.globalAlpha = 1;
      this.items = alive;
    }
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function drawStar(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x, y, x + s, y);
    ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y);
    ctx.quadraticCurveTo(x, y, x, y - s);
    ctx.fill();
  }

  BF.ParticleSystem = ParticleSystem;
})();
