# Balloon Fill

A dual-balloon multiplier casino game (play money). Pump air into two balloons at once — each has its own bet, multiplier, auto cash-out and pop point. Cash out before it pops.

**Run it:** open `index.html` in a browser (no build step, no server needed). Or `python3 -m http.server` in this folder and visit http://localhost:8000.

## Rules
- Multiplier starts at 1.00x and grows exponentially: `m(t) = e^(0.00012 · speed · t_ms)` (normal ≈ 2x at 5.8s, 10x at 19s).
- Pop time is random from the moment filling starts. The pop point of a normal balloon follows `P(survive to x) = 0.97 / x` (3% house edge).
- **Golden Balloon**: exactly one in every 50 balloons, at a random position within each block of 50 (so it can't be waited for). It inflates at 1.5× speed, its pop *time* is drawn from the exact same distribution as a normal balloon, and it is auto-cashed at **10x** if it survives that long.
- Auto cash-out settles at exactly the target if it is reached before the pop.

## Payouts (from `npm run simulate`)
| | Return to player |
| --- | --- |
| Normal balloon, any target | 97% |
| Golden balloon, held to the 10x cap | ~209% (`0.97 × 10^(1/3)`) |
| All balloons, flat bets, golden held to cap | ~99.2% |
| "Counting" exploit: bet big only on a guaranteed golden | ~103% |

The last line is why the golden schedule must live on the server (ideally one schedule shared by all players) before any real money is involved: a player who counts their own rounds knows the 50th balloon of a block with no golden yet is golden.

## Rewards
- **Daily bonus**: $100 on day 1, +$50 per consecutive day up to $500; a missed day resets the streak. Level 20 doubles it.
- **Daily missions**: 3 per day from a pool of 7, the same for everyone on a given day; rewards chips + XP.
- **Records**: balloons filled, win rate, best multiplier, biggest win, golden balloons, best streak, net profit.
- **Biggest wins**: top 5 wins seen in the live feed this session.
- Haptic feedback on phones (pop, cash-out, golden), following the sound toggle.

## Tests
```
npm test            # unit tests + payout checks (Node 18+, no dependencies)
npm run simulate    # print the payout table above
```

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
| `rewards.js` | Daily bonus, daily missions, personal records (no DOM) |
| `feed.js` | Live feed + simulated players (replace simulator with a websocket) |
| `audio.js` | Synthesized SFX; `BF.sound.useFile(name, url)` to use real audio files |
| `particles.js` | Canvas particles (pop shards, coins, golden glitter, confetti) |
| `storage.js` | localStorage persistence (safe if storage is blocked) |
| `main.js` | Controller wiring everything together + render loop |

### Going server-authoritative
Implement a provider with the same `createRound()` contract that fetches the round from your backend (e.g. `HMAC_SHA256(serverSeed, clientSeed:nonce)` → pop point), keep the pop time server-side, and have `cashOut` confirm with the server before crediting the `Wallet`.
