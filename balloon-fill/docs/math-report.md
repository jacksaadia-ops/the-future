# Balloon Fill — Game Math Report (PAR sheet)

Generated 2026-10-01 by `tools/math-report.js` from code version `8af1375`.
All theoretical values are computed exactly from the game code; simulated values run the real settlement code.
Simulation size: 10,000,000 balloons per RTP setting.

> Draft for internal review and test-lab submission. Not legal advice; RTP rules and disclosure
> requirements vary by jurisdiction and must be confirmed with the certifying lab.

## 1. Game summary

Shared-round multiplier ("crash") game with 2 balloons per round. Players bet on one balloon or both during a
6-second betting window. Bets then lock, any golden balloon is revealed, and both balloons inflate
from 1.00x at the same instant. Each balloon pops at an independent random moment. A bet wins its stake times the
multiplier at which it is cashed out (manually or by auto cash-out) before its balloon pops; otherwise it loses the stake.

## 2. Parameters

| Parameter | Value |
| --- | --- |
| RTP settings offered | 95%, 96%, 97%, 98% (default 96%) |
| Balloons per round | 2, independent outcomes |
| Multiplier curve | m(t) = e^(0.00012 × speed × t), t in ms; normal reaches 2x in 5.78 s |
| Long-flight speed-up | above 5x the flight clock runs 3× faster (same mapping for every balloon; pop points and payouts unchanged) |
| Auto bet | on, up to 100 rounds (operator setting) |
| Multiplier resolution | 0.01 (pop points, auto cash-out targets and manual cash-outs are whole cents; manual cash-outs round down) |
| Manual cash-out | from 1.01x, so a cash-out always pays more than the stake |
| Settlement | exact: stake (whole cents) × multiplier (0.01x steps) is paid to 1/10,000 dollar and never rounded to the cent (e.g. 0.10 × 1.05x = 0.105), so the cash return equals the multiplier return at every stake |
| Maximum win per bet | 250,000, stake included: a bet is cashed out automatically at MAX_WIN ÷ stake if the balloon gets there (RTP unchanged, see §7) |
| Maximum multiplier | 10,000x (balloon pays out at this value if it survives) |
| Golden chance | 1.00% per balloon, independent, revealed only after bets lock |
| Golden speed | 1.5× (same pop point and odds as a normal balloon; it gets there sooner) |
| Bet limits | 0.10 – 10,000 per balloon |
| Round timing | betting 6 s, lock/reveal 1 s, results 2 s |
| Random source | Provably fair: SHA-256(serverSeed : clientSeed1 : clientSeed2 : clientSeed3 : balloonIndex); first 52 bits → pop point, next 52 bits → golden. Server seed from a CSPRNG, committed by its SHA-256 before betting opens. Runs client-side in this build. |

## 3. Mathematical model

For each balloon a uniform U in [0, 1) — the first 52 bits of the balloon's provably-fair hash — is converted to a pop point:

    P = max(1.00, floor_to_cent( k / (1 − U) ))       capped at the maximum multiplier

so for any target x on the 0.01 grid (x ≥ 1.01):  **P(balloon reaches x) = k / x**, and cashing out at x returns
**x · k / x = k** regardless of x. Pop points below 1.01x pop instantly (rate 1 − k/1.01).

A golden balloon draws its pop point P exactly the same way, pops at the same multiplier P and has the same maximum;
it only inflates 1.5× faster, so it reaches P sooner. The chance of reaching any multiplier is therefore
identical for golden and normal balloons.

k is the operator RTP, so every cash-out target on every balloon returns exactly the configured RTP:

    k = RTP

## 4. RTP by setting

| RTP setting | k (return, any target) | Instant-pop rate | Theory | Simulated, 95% CI | Lowest possible play |
| --- | --- | --- | --- | --- | --- |
| 95% | 95.000% | 5.941% | 95.0000% | 95.022% ± 0.063% | 94.059% |
| 96% | 96.000% | 4.950% | 96.0000% | 95.950% ± 0.063% | 95.050% |
| 97% | 97.000% | 3.960% | 97.0000% | 97.040% ± 0.063% | 96.040% |
| 98% | 98.000% | 2.970% | 98.0000% | 97.908% ± 0.063% | 97.030% |

- **Theory**: every auto cash-out target, on golden and normal balloons, returns k. Simulated with a 2.00x target on normal
  balloons and a 5.00x target on golden ones.
- **Manual cash-outs** open at 1.01x and are paid the multiplier rounded down to 0.01x, so they return
  slightly less than k (at most 1%, at the very first cash-out point); no play returns more than k.

## 5. Detail for the default 96% setting

k = 0.960000.

### 5.1 Per cash-out target (bet of 1, golden or normal balloon)

| Target | P(win) | Hit frequency | RTP | Std. deviation |
| --- | --- | --- | --- | --- |
| 1.01x | 95.050% | 1 in 1.05 | 96.000% | 0.219 |
| 1.10x | 87.273% | 1 in 1.15 | 96.000% | 0.367 |
| 1.25x | 76.800% | 1 in 1.30 | 96.000% | 0.528 |
| 1.50x | 64.000% | 1 in 1.56 | 96.000% | 0.720 |
| 2.00x | 48.000% | 1 in 2.08 | 96.000% | 0.999 |
| 3.00x | 32.000% | 1 in 3.13 | 96.000% | 1.399 |
| 5.00x | 19.200% | 1 in 5.21 | 96.000% | 1.969 |
| 10.00x | 9.600% | 1 in 10 | 96.000% | 2.946 |
| 20.00x | 4.800% | 1 in 21 | 96.000% | 4.275 |
| 50.00x | 1.920% | 1 in 52 | 96.000% | 6.861 |
| 100.00x | 0.960% | 1 in 104 | 96.000% | 9.751 |
| 1000.00x | 0.096% | 1 in 1,042 | 96.000% | 30.969 |
| 10000.00x | 0.010% | 1 in 10,417 | 96.000% | 97.975 |

Golden balloons follow exactly the same table.

### 5.2 Pop-point distribution (golden and normal balloons)

| Pops before | Probability |
| --- | --- |
| 1.01x | 4.950% |
| 1.50x | 36.000% |
| 2.00x | 52.000% |
| 3.00x | 68.000% |
| 5.00x | 80.800% |
| 10.00x | 90.400% |
| 100.00x | 99.040% |
| (median pop point) | 1.92x |

### 5.3 Golden frequency

- Per balloon: 1.00% (1 in 100).
- Per round (at least one of 2): 1.99%.
- Golden balloon reaching 10.00x: 9.600% of golden balloons (the same as a normal balloon).
- Golden status is drawn independently for every balloon, so past rounds carry no information about future ones.

## 6. Round timing (from 200,000 simulated rounds)

| Measure | Value |
| --- | --- |
| Fixed time per round (betting + reveal + results) | 9.0 s |
| Flight time (until both balloons finish) — mean / median / 95th percentile | 10.1 s / 9.8 s / 19.0 s |
| Mean round length | 19.1 s |
| Rounds per hour | ~189 |

## 7. Exposure

- Maximum multiplier on a normal balloon: 10,000x (probability 0.0096% per balloon).
- Maximum win per bet: 250,000 (operator setting `MAX_WIN`), stake included. Without it the largest payout would be
  100,000,000 (bet 10,000 × 10,000x).
- How it is applied: each bet is cashed out automatically at min(auto target, 250,000 ÷ stake rounded down to 0.01x)
  (e.g. 25x on a 10,000 bet). A cash-out at any multiplier x is reached with probability k / x,
  so it returns k: the cap never lowers the RTP, and no payout can exceed the max win.

## 8. Open items before certification

- Move outcome generation, the round clock, bet acceptance and cash-out confirmation to the server; certify the RNG.
- Provably fair is implemented (server seed committed by hash before betting, first 3 bettors' client seeds, per-round verification in the game).
  In production the seeds must be generated and held on the server, and the verification page served from outside the game client.
- Disconnection: this build refunds bets that were not yet locked, and settles locked bets when the player returns exactly as the
  round played out (auto cash-out or max-win cap if reached, otherwise lost). In production this settlement belongs on the server.
- Responsible-gambling controls and jurisdiction-specific disclosures (e.g. autoplay, round speed) for the chosen market.

