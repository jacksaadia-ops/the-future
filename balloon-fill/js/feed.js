/**
 * Live feed + simulated crowd. The crowd plays the SAME shared rounds as the
 * local player: it places bets during the betting window, cashes out as the
 * real balloons pass each player's target, and loses when they pop.
 * Replace CrowdSimulator with a websocket subscription for real multiplayer.
 */
(function () {
  const { money, mult, pick, rand, randInt, Emitter } = BF.util;

  const NAMES = [
    'LunaBet', 'AirKing', 'PuffDaddy', 'Mika_77', 'HelioHigh', 'NeonNate', 'Zephyr', 'BlowHard',
    'CryptoCat', 'Skye', 'JackpotJo', 'RedBaron', 'Pressure', 'SoftPop', 'Inflato', 'GoldRush',
    'Vex', 'Nimbus', 'Bubbles', 'KaiZen', 'Rizzo', 'FloatOn', 'HotAir', 'Sasha.v', 'TurboTom',
    'Riya', 'Mr.Pump', 'Ghosted', 'Stratos', 'Pixel', 'Orbit', 'Lilo', 'Big_Sam', 'Aria', 'Dex',
  ];
  const AVATAR_COLORS = ['#ff2e88', '#1fc8ff', '#8dff2e', '#a36bff', '#ff7a3d', '#2fffc1', '#ffd84d'];

  class LiveFeed extends Emitter {
    constructor(listEl, onlineEl, maxItems) {
      super();
      this.list = listEl;
      this.onlineEl = onlineEl;
      this.max = maxItems;
      this.online = randInt(1100, 1600);
    }

    /** entry: { name, you, won, multiplier, amount, golden, balloon } */
    push(entry) {
      const li = document.createElement('li');
      li.className = `feed-item ${entry.won ? 'win' : 'lose'}${entry.you ? ' you' : ''}${entry.golden ? ' golden' : ''}`;
      const color = entry.you ? '#ffd84d' : AVATAR_COLORS[entry.name.charCodeAt(0) % AVATAR_COLORS.length];
      const where = entry.balloon !== undefined ? ` <i class="b-tag">B${entry.balloon + 1}</i>` : '';
      const action = entry.won ? `cashed out <b>${mult(entry.multiplier)}</b>` : `popped at <b>${mult(entry.multiplier)}</b>`;
      li.innerHTML = `
        <span class="avatar" style="--av:${color}">${entry.you ? '★' : entry.name[0]}</span>
        <span class="feed-text"><span class="feed-name">${entry.you ? 'You' : entry.name}${where}${entry.golden ? '<i class="gold-tag">GOLD</i>' : ''}</span>
        <span class="feed-action">${action}</span></span>
        <span class="feed-amount">${entry.won ? '+' : '-'}${money(entry.amount)}</span>`;
      this.list.prepend(li);
      while (this.list.children.length > this.max) this.list.lastChild.remove();
      this.emit('entry', entry);
    }

    tickOnline() {
      this.online = Math.max(600, this.online + randInt(-18, 20));
      this.onlineEl.textContent = this.online.toLocaleString('en-US');
    }
  }

  const BET_SIZES = [1, 2, 5, 5, 10, 10, 20, 25, 50, 100, 250, 500];
  const TARGETS = [1.2, 1.3, 1.5, 1.5, 2, 2, 2, 2.5, 3, 5, 10];

  class CrowdSimulator {
    constructor(feed, engine) {
      this.feed = feed;
      this.engine = engine;
      this.players = [];
      engine.on('betting', ({ closesAt }) => this.newRound(closesAt));
      engine.on('balloonEnd', (b) => this.settle(b));
      setInterval(() => this.feed.tickOnline(), 4000);
    }

    newRound(closesAt) {
      const now = performance.now();
      this.players = [];
      for (let b = 0; b < BF.CONFIG.BALLOONS; b++) {
        const n = randInt(15, 55);
        for (let i = 0; i < n; i++) {
          this.players.push({
            name: pick(NAMES), balloon: b,
            bet: pick(BET_SIZES) * (Math.random() < 0.1 ? 4 : 1),
            target: Math.random() < 0.8 ? pick(TARGETS) : Math.round(rand(1.1, 20) * 100) / 100,
            joinAt: now + rand(0, Math.max(0, closesAt - now - 300)),
            done: false,
          });
        }
      }
    }

    /** Players who have joined so far on balloon i: { count, total }. */
    stats(i, now) {
      let count = 0;
      let total = 0;
      const locked = this.engine.phase !== 'betting';
      this.players.forEach((p) => {
        if (p.balloon === i && (locked || p.joinAt <= now)) { count++; total += p.bet; }
      });
      return { count, total };
    }

    /** Cash out crowd players whose target the shared balloon has passed. */
    update() {
      if (this.engine.phase !== 'flying') return;
      this.engine.balloons.forEach((b) => {
        if (!b.isFilling) return;
        this.players.forEach((p) => {
          if (p.balloon !== b.index || p.done || p.target >= b.maxMultiplier || b.multiplier < p.target) return;
          p.done = true;
          if (p.bet >= 50 || Math.random() < 0.18) {
            this.feed.push({ name: p.name, won: true, multiplier: p.target, amount: p.bet * p.target, golden: b.golden, balloon: b.index });
          }
        });
      });
    }

    settle(b) {
      const rest = this.players.filter((p) => p.balloon === b.index && !p.done);
      rest.forEach((p) => { p.done = true; });
      rest.sort((x, y) => y.bet - x.bet);
      if (b.state === 'maxed') {
        rest.slice(0, 4).forEach((p) => this.feed.push({
          name: p.name, won: true, multiplier: b.maxMultiplier, amount: p.bet * b.maxMultiplier, golden: true, balloon: b.index,
        }));
      } else {
        rest.slice(0, 2).forEach((p) => this.feed.push({
          name: p.name, won: false, multiplier: b.multiplier, amount: p.bet, golden: b.golden, balloon: b.index,
        }));
      }
    }
  }

  BF.LiveFeed = LiveFeed;
  BF.CrowdSimulator = CrowdSimulator;
})();
