# Balloon Fill — Game Math Report (PAR sheet)

Generated 2026-09-30 by `tools/math-report.js` from code version `bf0d46b (with uncommitted changes)`.
All theoretical values are computed exactly from the game code; simulated values run the real settlement code.
Simulation size: 2,000,000 balloons per RTP setting.

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
| RTP settings offered | 94%, 95.5%, 96%, 97% (default 95.5%) |
| Balloons per round | 2, independent outcomes |
| Multiplier curve | m(t) = e^(0.00012 × speed × t), t in ms; normal reaches 2x in 5.78 s |
| Long-flight speed-up | above 5x the flight clock runs 3× faster (same mapping for every balloon; pop points and payouts unchanged) |
| Auto bet | on, up to 100 rounds (operator setting) |
| Multiplier resolution | 0.01 (pop points, auto cash-out targets and manual cash-outs are whole cents; manual cash-outs round down) |
| Maximum multiplier | 10,000x (balloon pays out at this value if it survives) |
| Golden chance | 1.00% per balloon, independent, revealed only after bets lock |
| Golden speed | 1.5× (same pop point and odds as a normal balloon; it gets there sooner) |
| Golden cap | 10.00x (paid automatically to every bet still in) |
| Bet limits | 0.10 – 10,000 per balloon |
| Round timing | betting 6 s, lock/reveal 1 s, results 2 s |
| Random source | Provably fair: SHA-256(serverSeed : clientSeed1 : clientSeed2 : clientSeed3 : balloonIndex); first 52 bits → pop point, next 52 bits → golden. Server seed from a CSPRNG, committed by its SHA-256 before betting opens. Runs client-side in this build. |

## 3. Mathematical model

For each balloon a uniform U in [0, 1) — the first 52 bits of the balloon's provably-fair hash — is converted to a pop point:

    P = max(1.00, floor_to_cent( k / (1 − U) ))       capped at the maximum multiplier

so for any target x on the 0.01 grid (x ≥ 1.01):  **P(balloon reaches x) = k / x**, and cashing out at x returns
**x · k / x = k** regardless of x. Pop points below 1.01x pop instantly (rate 1 − k/1.01).

A golden balloon draws its pop point P exactly the same way and pops at the same multiplier P; it only inflates
1.5× faster, so it reaches P sooner. If P ≥ 10.00x it stops at the cap and every bet still in is paid
10.00x, so a golden target y returns k for y ≤ cap, and any higher target is paid at the cap (also k).
The chance of reaching any multiplier is therefore identical for golden and normal balloons.

k is the operator RTP, so every cash-out target on every balloon returns exactly the configured RTP:

    k = RTP

## 4. RTP by setting

| RTP setting | k (return, any target) | Instant-pop rate | Theory | Simulated, 95% CI | Lowest possible play |
| --- | --- | --- | --- | --- | --- |
| 94% | 94.000% | 6.931% | 94.0000% | 93.933% ± 0.140% | 93.069% |
| 95.5% | 95.500% | 5.446% | 95.5000% | 95.376% ± 0.140% | 94.554% |
| 96% | 96.000% | 4.950% | 96.0000% | 95.932% ± 0.140% | 95.050% |
| 97% | 97.000% | 3.960% | 97.0000% | 97.066% ± 0.140% | 96.040% |

- **Theory**: every auto cash-out target, on golden and normal balloons, returns k. Simulated with a 2.00x target on normal
  balloons and a 5.00x target on golden ones.
- **Lowest possible play**: manual cash-out at the very start (paid 1.00x after rounding down to the cent) returns k / 1.01.
  Manual cash-outs in general return between k/1.01 and k because the multiplier is rounded down to the cent.

## 5. Detail for the default 95.5% setting

k = 0.955000.

### 5.1 Per cash-out target (bet of 1, golden or normal balloon)

| Target | P(win) | Hit frequency | RTP | Std. deviation |
| --- | --- | --- | --- | --- |
| 1.01x | 94.554% | 1 in 1.06 | 95.500% | 0.229 |
| 1.10x | 86.818% | 1 in 1.15 | 95.500% | 0.372 |
| 1.25x | 76.400% | 1 in 1.31 | 95.500% | 0.531 |
| 1.50x | 63.667% | 1 in 1.57 | 95.500% | 0.721 |
| 2.00x | 47.750% | 1 in 2.09 | 95.500% | 0.999 |
| 3.00x | 31.833% | 1 in 3.14 | 95.500% | 1.397 |
| 5.00x | 19.100% | 1 in 5.24 | 95.500% | 1.965 |
| 10.00x | 9.550% | 1 in 10 | 95.500% | 2.939 |
| 20.00x | 4.775% | 1 in 21 | 95.500% | 4.265 |
| 50.00x | 1.910% | 1 in 52 | 95.500% | 6.844 |
| 100.00x | 0.955% | 1 in 105 | 95.500% | 9.726 |
| 1000.00x | 0.096% | 1 in 1,047 | 95.500% | 30.888 |
| 10000.00x | 0.010% | 1 in 10,471 | 95.500% | 97.719 |

Golden balloons follow the same table up to the 10.00x cap; a golden target above the cap is paid at the cap with
probability 9.550%, returning the same k.

### 5.2 Pop-point distribution (golden and normal balloons)

| Pops before | Probability |
| --- | --- |
| 1.01x | 5.446% |
| 1.50x | 36.333% |
| 2.00x | 52.250% |
| 3.00x | 68.167% |
| 5.00x | 80.900% |
| 10.00x | 90.450% |
| 100.00x | 99.045% |
| (median pop point) | 1.91x |

### 5.3 Golden frequency

- Per balloon: 1.00% (1 in 100).
- Per round (at least one of 2): 1.99%.
- Golden balloon reaching the 10.00x cap: 9.550% of golden balloons (the same as a normal balloon reaching 10.00x).
- Golden status is drawn independently for every balloon, so past rounds carry no information about future ones.

## 6. Round timing (from 200,000 simulated rounds)

| Measure | Value |
| --- | --- |
| Fixed time per round (betting + reveal + results) | 9.0 s |
| Flight time (until both balloons finish) — mean / median / 95th percentile | 10.0 s / 9.8 s / 19.0 s |
| Mean round length | 19.0 s |
| Rounds per hour | ~189 |

## 7. Exposure

- Maximum multiplier on a normal balloon: 10,000x (probability 0.0095% per balloon).
- Maximum single payout at the current bet limit: 100,000,000 (bet 10,000 × 10,000x).
- **Recommendation:** add an operator-configurable maximum win per bet (a common requirement for operators),
  and state it in the game rules. Capping winnings reduces RTP slightly for the highest targets; this report must then be regenerated.

## 8. Open items before certification

- Move outcome generation, the round clock, bet acceptance and cash-out confirmation to the server; certify the RNG.
- Provably fair is implemented (server seed committed by hash before betting, first 3 bettors' client seeds, per-round verification in the game).
  In production the seeds must be generated and held on the server, and the verification page served from outside the game client.
- Disconnection: a bet that is locked in must keep running and still honour auto cash-out if the player disconnects.
  (This client-only build refunds bets that were not yet locked and forfeits bets that were in flight.)
- Maximum win per bet (see §7), responsible-gambling controls, and jurisdiction-specific disclosures.

