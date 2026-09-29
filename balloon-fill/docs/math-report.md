# Balloon Fill — Game Math Report (PAR sheet)

Generated 2026-09-29 by `tools/math-report.js` from code version `b2a1e6c`.
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
| RTP settings offered | 94%, 96%, 97% (default 97%) |
| Balloons per round | 2, independent outcomes |
| Multiplier curve | m(t) = e^(0.00012 × speed × t), t in ms; normal reaches 2x in 5.78 s |
| Multiplier resolution | 0.01 (pop points, auto cash-out targets and manual cash-outs are whole cents; manual cash-outs round down) |
| Maximum multiplier | 10,000x (balloon pays out at this value if it survives) |
| Golden chance | 1.00% per balloon, independent, revealed only after bets lock |
| Golden speed | 1.5× (pops at the same moment it otherwise would) |
| Golden cap | 10.00x (paid automatically to every bet still in) |
| Bet limits | 0.10 – 10,000 per balloon |
| Round timing | betting 6 s, lock/reveal 1 s, results 2 s |
| Random source | Provably fair: SHA-256(serverSeed : clientSeed1 : clientSeed2 : clientSeed3 : balloonIndex); first 52 bits → pop point, next 52 bits → golden. Server seed from a CSPRNG, committed by its SHA-256 before betting opens. Runs client-side in this build. |

## 3. Mathematical model

For each balloon a uniform U in [0, 1) — the first 52 bits of the balloon's provably-fair hash — is converted to a normal-curve pop point:

    P = max(1.00, floor_to_cent( k / (1 − U) ))       capped at the maximum multiplier

so for any target x on the 0.01 grid (x ≥ 1.01):  **P(balloon reaches x) = k / x**, and cashing out at x returns
**x · k / x = k** regardless of x. Pop points below 1.01x pop instantly (rate 1 − k/1.01).

A golden balloon uses the same pop *time* but grows 1.5× faster, so it reaches y exactly when the
normal pop point is ≥ y^(1/1.5). Its return at target y ≤ cap is k · y / ceil_to_cent(y^(1/1.5)).
The best golden target is **9.99x**, returning k × 2.15302
(holding to the 10.00x cap returns k × 2.15054; the continuous approximation is 2.15443).

k is set from the operator RTP so that best-possible play returns exactly the configured RTP (GLI-19 §4.7.1 measures
minimum RTP using the strategy with the greatest return):

    RTP = k · [ (1 − 0.01) + 0.01 · 2.15302 ]

## 4. RTP by setting

| RTP setting | k (normal balloon return) | Instant-pop rate | Best play (theory) | Best play (simulated, 95% CI) | Lowest possible play |
| --- | --- | --- | --- | --- | --- |
| 94% | 92.929% | 7.992% | 94.0000% | 93.997% ± 0.067% | 92.008% |
| 96% | 94.906% | 6.034% | 96.0000% | 96.022% ± 0.067% | 93.966% |
| 97% | 95.894% | 5.055% | 97.0000% | 97.008% ± 0.067% | 94.945% |

- **Best play**: any normal-balloon target (all return k), golden balloons cashed at the best golden target.
- **Any auto cash-out target**: between k and best play, depending on the golden-balloon target.
- **Lowest possible play**: manual cash-out at the very start (paid 1.00x after rounding down to the cent) returns k / 1.01.
  Manual cash-outs in general return between k/1.01 and k because the multiplier is rounded down to the cent.

## 5. Detail for the default 97% setting

k = 0.958943.

### 5.1 Normal balloon — per cash-out target (bet of 1)

| Target | P(win) | Hit frequency | RTP | Std. deviation |
| --- | --- | --- | --- | --- |
| 1.01x | 94.945% | 1 in 1.05 | 95.894% | 0.221 |
| 1.10x | 87.177% | 1 in 1.15 | 95.894% | 0.368 |
| 1.25x | 76.715% | 1 in 1.30 | 95.894% | 0.528 |
| 1.50x | 63.930% | 1 in 1.56 | 95.894% | 0.720 |
| 2.00x | 47.947% | 1 in 2.09 | 95.894% | 0.999 |
| 3.00x | 31.965% | 1 in 3.13 | 95.894% | 1.399 |
| 5.00x | 19.179% | 1 in 5.21 | 95.894% | 1.969 |
| 10.00x | 9.589% | 1 in 10 | 95.894% | 2.944 |
| 20.00x | 4.795% | 1 in 21 | 95.894% | 4.273 |
| 50.00x | 1.918% | 1 in 52 | 95.894% | 6.858 |
| 100.00x | 0.959% | 1 in 104 | 95.894% | 9.745 |
| 1000.00x | 0.096% | 1 in 1,043 | 95.894% | 30.952 |
| 10000.00x | 0.010% | 1 in 10,428 | 95.894% | 97.921 |

### 5.2 Golden balloon — per cash-out target (bet of 1)

| Target | P(win) | RTP |
| --- | --- | --- |
| 1.50x | 72.647% | 108.971% |
| 2.00x | 60.311% | 120.622% |
| 3.00x | 45.882% | 137.647% |
| 5.00x | 32.728% | 163.642% |
| 7.50x | 24.972% | 187.294% |
| 9.99x (best) | 20.667% | 206.462% |
| 10.00x (cap) | 20.622% | 206.224% |

### 5.3 Pop-point distribution (normal balloon)

| Pops before | Probability |
| --- | --- |
| 1.01x | 5.055% |
| 1.50x | 36.070% |
| 2.00x | 52.053% |
| 3.00x | 68.035% |
| 5.00x | 80.821% |
| 10.00x | 90.411% |
| 100.00x | 99.041% |
| (median pop point) | 1.92x |

### 5.4 Golden frequency

- Per balloon: 1.00% (1 in 100).
- Per round (at least one of 2): 1.99%.
- Golden balloon reaching the 10.00x cap: 20.622% of golden balloons.
- Golden status is drawn independently for every balloon, so past rounds carry no information about future ones.

## 6. Round timing (from 200,000 simulated rounds)

| Measure | Value |
| --- | --- |
| Fixed time per round (betting + reveal + results) | 9.0 s |
| Flight time (until both balloons finish) — mean / median / 95th percentile | 12.1 s / 9.8 s / 30.4 s |
| Mean round length | 21.1 s |
| Rounds per hour | ~170 |

## 7. Exposure

- Maximum multiplier on a normal balloon: 10,000x (probability 0.0096% per balloon).
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

