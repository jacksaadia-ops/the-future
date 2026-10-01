# Balloon Fill

A dual-balloon multiplier casino game (play money). Pump air into two balloons at once — each has its own bet, multiplier, auto cash-out and pop point. Cash out before it pops.

**Run it:** open `index.html` in a browser (no build step, no server needed). Or `python3 -m http.server` in this folder and visit http://localhost:8000.

## How a round works (shared, like Aviator)
Every player watches the same two balloons.

1. **Betting window (6 s)** — place a bet on Balloon 1, Balloon 2, or both (each with its own amount and optional auto cash-out). Bets can be cancelled until the window closes.
2. **Bets lock (1 s)** — no more changes. Only now is it revealed whether a balloon is **golden**.
3. **Filling** — both balloons inflate from 1.00x at the same instant; each pops at its own random moment. Cash out any time before yours pops (or let auto cash-out do it).
4. **Round over (2 s)** — results, then the next betting window opens.

While a round is running you can queue a bet for the next round ("Bet Next Round"); it is placed automatically when betting opens.

## Odds
- Multiplier: `m(t) = e^(0.00012 · speed · t_ms)` (normal ≈ 2x at 5.8 s, 5x at 13.4 s). Above **5x** the clock runs **3× faster** (`WARP_FROM` / `WARP_SPEEDUP`), so rare high-flyers finish sooner; every balloon uses the same clock, so pop points and payouts are unchanged.
- **Auto bet** repeats a balloon's bet for up to 100 rounds; it stops when the rounds run out, the balance is too low, the bet is cancelled, or it's switched off. Operators can disable it (`AUTO_BET`) for markets that restrict autoplay.
- Pop point for every balloon, golden or normal: `P(survive to x) = k / x` with `k = RTP`, so every cash-out target returns the RTP.
- **Golden Balloon**: each balloon independently has a **1% chance**, revealed after bets lock, so there is no pattern to wait for. It has **exactly the same pop odds** as a normal balloon (same pop point, same multiplier) and only inflates at **1.5× speed**, so it gets there sooner. It has the same 10,000x maximum as a normal balloon and returns the same `k` at every target.
- **RTP is one operator setting** (`RTP` in `config.js`, one of 95 / 96 / 97 / 98 %, default 96%; `?rtp=0.97` in the URL for testing). `k = RTP`: every target on every balloon returns the setting.

## Payouts (from `npm run simulate`)
| RTP setting | Normal balloons, any target | Golden balloons, any target | Overall |
| --- | --- | --- | --- |
| 98% | 98.0% | 98.0% | 98.0% |
| 97% | 97.0% | 97.0% | 97.0% |
| **96% (default)** | 96.0% | 96.0% | 96.0% |
| 95% | 95.0% | 95.0% | 95.0% |

## Rewards
- **Daily bonus**: $100 on day 1, +$50 per consecutive day up to $500; a missed day resets the streak. Level 20 doubles it.
- **Daily missions**: 3 per day from a pool of 7, the same for everyone on a given day; rewards chips + XP.
- **Records**: balloons filled, win rate, best multiplier, biggest win, golden balloons, best streak, net profit.
- **Biggest wins**: top 5 wins seen in the live feed this session.
- Haptic feedback on phones (pop, cash-out, golden), following the sound toggle.

## Tests and math report
```
npm test            # unit tests + payout checks (Node 18+, no dependencies)
npm run simulate    # quick payout table per RTP setting
npm run report      # regenerate docs/math-report.md (PAR sheet) from the game code
npm run crowd-sim -- 200 100 1000   # 200 players × 100 rounds, repeated 1,000 times: wagered, paid, house profit
```

`docs/math-report.md` is the game's math report for test-lab submission: parameters, the odds model, exact RTP for each
setting (best play and lowest possible play), per-target win probabilities and volatility, golden-balloon figures, round
timing and exposure — every value computed from the running code and cross-checked by simulation. Regenerate it after
changing anything in `config.js`.

In the game, the **?** button (or "Rules & payouts" in the footer) opens the player-facing rules, generated from the same
settings so the published RTP and limits always match the game.

## Controls
- Per balloon: bet (½ / 2×), auto cash-out toggle + target, and one button that becomes Place Bet → Cancel Bet → Cash Out → Bet Next Round.
- Big button: Bet on Both / Cancel Bets / Cash Out All / Bet Both Next Round.
- Keyboard: `Space` = big button, `1` / `2` = bet on / cash out a balloon.

## Code layout (`js/`)
| File | Role |
| --- | --- |
| `config.js` | All tunables (growth rate, house edge, golden chance, limits) |
| `outcome.js` | Odds model (pop-point distribution, golden factor, RTP → k) |
| `fair.js` | Provably fair: SHA-256, seed handling, round derivation, `verify()`, `FairRoundProvider` |
| `round.js` | `RoundEngine` shared round timeline (betting → reveal → flying → ended) + `SharedBalloon`, no DOM |
| `balloon.js` | `BetSlot` — the player's bet on one balloon (placed → active → cashed/lost, queued next bet), no DOM |
| `balloonView.js` | Renders a shared balloon + the player's bet (inflation, wobble, pop / float-away, buttons) |
| `wallet.js`, `progress.js`, `skins.js` | Balance, XP/levels/perks, cosmetic skins |
| `rewards.js` | Daily bonus, daily missions, personal records (no DOM) |
| `feed.js` | Live feed + simulated crowd playing the same rounds (replace with a websocket) |
| `audio.js` | Synthesized SFX; `BF.sound.useFile(name, url)` to use real audio files |
| `particles.js` | Canvas particles (pop shards, coins, golden glitter, confetti) |
| `storage.js` | localStorage persistence (safe if storage is blocked) |
| `main.js` | Controller wiring everything together + render loop |

## Provably fair
Each round's result comes from a **server seed**, locked in before betting opens by showing its SHA-256 fingerprint, plus the **client seeds of the first 3 players to bet**. When bets lock, for each balloon:

```
hash    = SHA-256( serverSeed : clientSeed1 : clientSeed2 : clientSeed3 : balloonIndex )
u       = first 13 hex digits / 2^52   → pop point = floor_to_cent( k / (1 − u) ), minimum 1.00
g       = next 13 hex digits  / 2^52   → golden if g < 0.01
```

After the round the server seed is revealed. In the game, the shield icon shows the current and next round's fingerprints, lets players set their own client seed, and lists recent rounds with a **Verify** view that recomputes every step. Clicking any balloon history chip opens that round. Logic: `js/fair.js` (includes a dependency-free SHA-256, tested against Node's crypto); UI: `js/fairView.js`.

### Going server-authoritative
`FairRoundProvider` (`commit()` when betting opens, `createRound(clientSeeds)` when bets lock) is the server boundary: move it to the backend unchanged, keep the seeds there until each round ends, run the round clock server-side and confirm every bet and cash-out there.
