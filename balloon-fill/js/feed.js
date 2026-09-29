/**
 * Live feed. Simulates other players (using the same pop distribution as the
 * real game) and also shows the local player's own results. Replace
 * `LiveFeedSimulator` with a websocket subscription for real multiplayer.
 */
(function () {
  const { money, mult, pick, rand, randInt } = BF.util;

  const NAMES = [
    'LunaBet', 'AirKing', 'PuffDaddy', 'Mika_77', 'HelioHigh', 'NeonNate', 'Zephyr', 'BlowHard',
    'CryptoCat', 'Skye', 'JackpotJo', 'RedBaron', 'Pressure', 'SoftPop', 'Inflato', 'GoldRush',
    'Vex', 'Nimbus', 'Bubbles', 'KaiZen', 'Rizzo', 'FloatOn', 'HotAir', 'Sasha.v', 'TurboTom',
    'Riya', 'Mr.Pump', 'Ghosted', 'Stratos', 'Pixel', 'Orbit', 'Lilo', 'Big_Sam', 'Aria', 'Dex',
  ];
  const AVATAR_COLORS = ['#ff2e88', '#1fc8ff', '#8dff2e', '#a36bff', '#ff7a3d', '#2fffc1', '#ffd84d'];

  class LiveFeed {
    constructor(listEl, onlineEl, maxItems) {
      this.list = listEl;
      this.onlineEl = onlineEl;
      this.max = maxItems;
      this.online = randInt(1100, 1600);
    }

    /** entry: { name, you, won, multiplier, amount, golden } */
    push(entry) {
      const li = document.createElement('li');
      li.className = `feed-item ${entry.won ? 'win' : 'lose'}${entry.you ? ' you' : ''}${entry.golden ? ' golden' : ''}`;
      const color = entry.you ? '#ffd84d' : AVATAR_COLORS[entry.name.charCodeAt(0) % AVATAR_COLORS.length];
      const action = entry.won ? `cashed out <b>${mult(entry.multiplier)}</b>` : `popped at <b>${mult(entry.multiplier)}</b>`;
      li.innerHTML = `
        <span class="avatar" style="--av:${color}">${entry.you ? '★' : entry.name[0]}</span>
        <span class="feed-text"><span class="feed-name">${entry.you ? 'You' : entry.name}${entry.golden ? '<i class="gold-tag">GOLD</i>' : ''}</span>
        <span class="feed-action">${action}</span></span>
        <span class="feed-amount">${entry.won ? '+' : '-'}${money(entry.amount)}</span>`;
      this.list.prepend(li);
      while (this.list.children.length > this.max) this.list.lastChild.remove();
    }

    tickOnline() {
      this.online = Math.max(600, this.online + randInt(-18, 20));
      this.onlineEl.textContent = this.online.toLocaleString('en-US');
    }
  }

  class LiveFeedSimulator {
    constructor(feed) { this.feed = feed; }

    start() {
      for (let i = 0; i < 8; i++) this.emitOne();
      const loop = () => {
        this.emitOne();
        if (Math.random() < 0.3) this.feed.tickOnline();
        this.timer = setTimeout(loop, rand(600, 2000));
      };
      loop();
    }

    emitOne() {
      const C = BF.CONFIG;
      const golden = Math.random() < C.GOLDEN_CHANCE;
      const normalPop = BF.outcome.samplePopPoint(Math.random());
      const popAt = golden ? normalPop * normalPop : normalPop;
      const target = Math.random() < 0.7 ? pick([1.3, 1.5, 2, 2, 2.5, 3, 5, 10]) : rand(1.1, 8);
      const bet = Math.round(Math.exp(rand(0, 6.2)) * 100) / 100; // ~$1 – $500
      const won = target <= popAt;
      const m = won ? target : popAt;
      this.feed.push({
        name: pick(NAMES), won, golden,
        multiplier: m, amount: won ? bet * target : bet,
      });
    }
  }

  BF.LiveFeed = LiveFeed;
  BF.LiveFeedSimulator = LiveFeedSimulator;
})();
