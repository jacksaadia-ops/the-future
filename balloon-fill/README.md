# Balloon Fill

A dual-balloon multiplier casino game (play money). Pump air into two balloons at once — each has its own bet, multiplier, auto cash-out and pop point. Cash out before it pops.

**Run it:** open `index.html` in a browser (no build step, no server needed). Or `python3 -m http.server` in this folder and visit http://localhost:8000.

## Rules
- Multiplier starts at 1.00x and grows exponentially: `m(t) = e^(0.00012 · speed · t_ms)` (normal ≈ 2x at 5.8s, 10x at 19s).
- Pop time is random from the moment filling starts. The pop point of a normal balloon follows `P(survive to x) = 0.97 / x` (3% house edge).
- **Golden Balloon** (10% chance, max one at a time): inflates at 2× speed, but its pop *time* is drawn from the exact same distribution — same chance to pop at any moment.
- Auto cash-out settles at exactly the target if it is reached before the pop.

## Controls
- Per balloon: bet (½ / 2×), auto cash-out toggle + target, Start Fill / Cash Out button.
- Big button: Start Both → Cash Out (all filling balloons).
- Keyboard: `Space` = big button, `1` / `2` = start or cash out a balloon.

## Code layout (`js/`)
| File | Role |
| --- | --- |
| `config.js` | All tunables (growth rate, house edge, golden chance, limits) |
| `outcome.js` | **Outcome provider** — the only code that decides pops. Swap for a server / provably-fair provider |
| `balloon.js` | `BalloonSlot` state machine (idle → filling → cashed/popped), no DOM |
| `balloonView.js` | Renders a slot (inflation, wobble, pop / float-away, buttons) |
| `wallet.js`, `progress.js`, `skins.js` | Balance, XP/levels/perks, cosmetic skins |
| `feed.js` | Live feed + simulated players (replace simulator with a websocket) |
| `audio.js` | Synthesized SFX; `BF.sound.useFile(name, url)` to use real audio files |
| `particles.js` | Canvas particles (pop shards, coins, golden glitter, confetti) |
| `storage.js` | localStorage persistence (safe if storage is blocked) |
| `main.js` | Controller wiring everything together + render loop |

### Going server-authoritative
Implement a provider with the same `createRound()` contract that fetches the round from your backend (e.g. `HMAC_SHA256(serverSeed, clientSeed:nonce)` → pop point), keep the pop time server-side, and have `cashOut` confirm with the server before crediting the `Wallet`.
