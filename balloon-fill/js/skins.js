/**
 * Cosmetic balloon skins. Colors feed CSS custom properties on the balloon:
 *   hi = highlight, main = body, deep = shadow/knot, glow = halo color.
 * `fx` enables an extra visual layer ('stars' | 'rainbow').
 */
(function () {
  BF.SKINS = [
    { id: 'neon-pink', name: 'Neon Pink', level: 1, hi: '#ffd1e6', main: '#ff2e88', deep: '#7d0a41', glow: 'rgba(255,46,136,.55)' },
    { id: 'electric-blue', name: 'Electric Blue', level: 1, hi: '#d2f7ff', main: '#1fc8ff', deep: '#064b73', glow: 'rgba(31,200,255,.55)' },
    { id: 'toxic-lime', name: 'Toxic Lime', level: 3, hi: '#f4ffd0', main: '#8dff2e', deep: '#2f6b06', glow: 'rgba(141,255,46,.5)' },
    { id: 'ultra-violet', name: 'Ultra Violet', level: 4, hi: '#ecd9ff', main: '#a36bff', deep: '#3a0f8a', glow: 'rgba(163,107,255,.55)' },
    { id: 'sunset', name: 'Sunset Blaze', level: 6, hi: '#fff0b8', main: '#ff7a3d', deep: '#a3123f', glow: 'rgba(255,122,61,.55)' },
    { id: 'mint', name: 'Arctic Mint', level: 8, hi: '#e6fff6', main: '#2fffc1', deep: '#05705a', glow: 'rgba(47,255,193,.5)' },
    { id: 'cosmic', name: 'Cosmic', level: 11, hi: '#d9b8ff', main: '#5a1fe0', deep: '#0c0233', glow: 'rgba(120,70,255,.6)', fx: 'stars' },
    { id: 'prism', name: 'Prism', level: 14, hi: '#ffffff', main: '#ff4fd8', deep: '#3b1f9e', glow: 'rgba(255,255,255,.45)', fx: 'rainbow' },
    { id: 'obsidian', name: 'Obsidian', level: 18, hi: '#aab3c8', main: '#2b3142', deep: '#05060a', glow: 'rgba(0,255,240,.45)' },
  ];

  BF.GOLDEN_SKIN = { hi: '#fff8d6', main: '#ffc41f', deep: '#8a5a00', glow: 'rgba(255,200,40,.75)' };

  BF.skinById = (id) => BF.SKINS.find((s) => s.id === id) || BF.SKINS[0];

  /** Applies skin colors as CSS variables to an element. */
  BF.applySkinVars = (el, skin) => {
    el.style.setProperty('--b-hi', skin.hi);
    el.style.setProperty('--b-main', skin.main);
    el.style.setProperty('--b-deep', skin.deep);
    el.style.setProperty('--b-glow', skin.glow);
  };

  /** Balloon SVG markup; `uid` keeps gradient ids unique per instance. */
  BF.balloonSVG = (uid) => `
    <svg class="balloon-svg" viewBox="0 0 200 228" aria-hidden="true">
      <defs>
        <radialGradient id="bg-${uid}" cx="36%" cy="30%" r="78%">
          <stop offset="0%" style="stop-color:var(--b-hi)" />
          <stop offset="42%" style="stop-color:var(--b-main)" />
          <stop offset="100%" style="stop-color:var(--b-deep)" />
        </radialGradient>
        <linearGradient id="sheen-${uid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#fff" stop-opacity="0" />
          <stop offset="50%" stop-color="#fff" stop-opacity=".75" />
          <stop offset="100%" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
        <clipPath id="clip-${uid}">
          <path d="M100 6C158 6 192 50 192 100C192 158 144 202 106 212H94C56 202 8 158 8 100C8 50 42 6 100 6Z" />
        </clipPath>
      </defs>
      <path class="b-body" d="M100 6C158 6 192 50 192 100C192 158 144 202 106 212H94C56 202 8 158 8 100C8 50 42 6 100 6Z" fill="url(#bg-${uid})" />
      <g clip-path="url(#clip-${uid})">
        <g class="fx-stars">
          <circle cx="60" cy="130" r="1.6" fill="#fff" /><circle cx="130" cy="60" r="1.2" fill="#fff" />
          <circle cx="150" cy="140" r="2" fill="#fff" /><circle cx="95" cy="170" r="1.2" fill="#fff" />
          <circle cx="120" cy="105" r="1" fill="#fff" /><circle cx="75" cy="85" r="1" fill="#fff" />
          <circle cx="160" cy="95" r="1.3" fill="#fff" /><circle cx="110" cy="35" r="1.1" fill="#fff" />
        </g>
        <rect class="b-sheen" x="-120" y="0" width="70" height="228" fill="url(#sheen-${uid})" transform="skewX(-18)" />
      </g>
      <ellipse cx="64" cy="60" rx="19" ry="33" transform="rotate(-28 64 60)" fill="#fff" opacity=".5" />
      <ellipse cx="50" cy="112" rx="6" ry="11" transform="rotate(-10 50 112)" fill="#fff" opacity=".22" />
      <path d="M90 211H110L114 226Q100 229 86 226Z" style="fill:var(--b-deep)" />
    </svg>`;
})();
