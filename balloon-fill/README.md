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
- Multiplier: `m(t) = e^(0.00012 · speed · t_ms)` (normal ≈ 2x at 5.8 s, 10x at 19 s).
- Normal balloon pop point: `P(survive to x) = k / x`, so every cash-out target returns `k`.
- **Golden Balloon**: each balloon independently has a **1% chance**, revealed after bets lock, so there is no pattern to wait for. It inflates at **1.5× speed**, pops at exactly the moment it otherwise would, and pays **10x** to everyone still in if it survives that long. Held to the cap it returns `k · 10^(1/3) ≈ 2.15k`.
- **RTP is one operator setting** (`RTP` in `config.js`, one of 94 / 96 / 97 %; `?rtp=0.96` in the URL for testing). `k` is derived so that the best possible overall return — golden balloons held to the cap — equals the setting exactly:
  `RTP = k · [(1 − p) + p · cap^(1 − 1/speed)]`

## Payouts (from `npm run simulate`)
| RTP setting | Normal balloons | Golden at best target (9.99x) | Overall (best play) |
| --- | --- | --- | --- |
| 97% | 95.9% | ~206% | 97.0% |
| 96% | 94.9% | ~204% | 96.0% |
| 94% | 92.9% | ~200% | 94.0% |

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
| `outcome.js` | **Outcome provider** — the only code that decides pops. Swap for a server / provably-fair provider |
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

### Going server-authoritative
The round engine already asks for each round's outcome when betting opens and reveals it only when bets lock. A real server would publish `SHA256(serverSeed)` at that moment, derive each balloon from `HMAC_SHA256(serverSeed, roundId:balloonIndex)`, run the round clock, confirm every bet and cash-out, and publish `serverSeed` afterwards so players can verify each round.
