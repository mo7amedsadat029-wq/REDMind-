# Numerical Verification & Literature Validation Report — REDMind v2.0.0

**Suite Coverage:** 10 Mandatory Physics Verification Tests + 25/25 `pytest` Automated Tests + 6 Literature Benchmarks + Full Stage 1–4 Dataset Audit.

---

## 1. Repaired Baseline Comparison (`data/original_51_cases/` vs. `data/repaired_baseline_51/`)

The v1.0.0 binary Nernst–Planck simulator (`51` cases, preserved untouched in `data/original_51_cases/`) had an inverted Neumann flux sign at the bottom CEM wall (`y=0`) of the concentrated channel (`HC`), causing non-physical local salt accumulation and elevated dilute-channel mass-balance discrepancies (`3.40%`). Repairing the sign and regenerating into `data/repaired_baseline_51/` (`seed=42`) yields:

| Metric | Original 51 Cases (v1.0.0) | Repaired 51 Cases (v2.0.0) | Physical Improvement |
| :--- | :---: | :---: | :--- |
| Converged / Failed Cases | 51 / 0 | 51 / 0 | All 51 LHS cases converge |
| Baseline `case_000` OCV [mV] | 155.403 | 155.201 | Resolves physical polarization drop (`-0.20 mV`) |
| Baseline `case_000` `P_gross_max` [W/m2] | 3.897 | 3.902 | Consistent boundary conductivity |
| Max `HC` Mass-Balance Error | `1.108e-3` (0.111%) | `5.871e-5` (0.0059%) | **18.9x tighter** |
| Max `LC` Mass-Balance Error | `3.396e-2` (3.40%) | `1.027e-3` (0.103%) | **33.1x tighter** |
| Max OCV Shift Across 51 Cases [mV] | — | `0.543` (mean `0.174`) | Restored depletion boundary layer |
| Max `P_gross_max` Shift [W/m2] | — | `1.151` | Physically accurate polarization |

---

## 2. Core Verification Suite (10 Mandatory Tests + 25/25 Pytest)

All **10/10** physics verification tests (`scripts/run_verification.py`) and **25/25** `pytest` unit/schema tests (`PYTHONPATH=. pytest tests/ -v`, `3.28 s`) pass:
- **Poiseuille Flow Benchmark:** Inlet flow rate error `4.00e-4`, `u_max` error `1.16e-16`, no-slip wall `0.00e+00`.
- **Mass Conservation (`case_000`):** HC error `1.012e-5`, LC error `2.977e-4` (target `< 2%`).
- **Mesh Refinement Convergence (`25x10`, `50x20`, `100x40`):** OCV shift `0.003%`, gross power shift `0.002%` (target `< 2%`).
- **Limiting Zero-Gradient Symmetry:** `E_ocv = 0.000e+00 V` identically when `c_HC == c_LC`.

---

## 3. Literature Benchmarks (`data/benchmark_cases/`)

### 3.1 Gurreri et al. (2017) & Long et al. (2018)
- **Channel Pressure Drop (`1 cm/s`, `h=270 um`, `L=10 cm`):** `146.50 Pa` simulated vs `146.50 Pa` published (`0.0014%` error).
- **Open-Circuit Voltage:** `0.1552 V` simulated vs `0.1550 V` target (`0.13%` error).
- **Peak Gross Power Density:** `3.901 W/m2` simulated vs `3.80 W/m2` nominal empty-channel benchmark (`2.67%` error).
- **Spatial vs Lumped (Long et al., 2018):** Lumped model neglects concentration polarization, over-predicting OCV by `0.13%` and altering resistance by `0.36%` at `1 cm/s`.

### 3.2 High-Salinity Pitzer Activity & Gypsum Salting-In
- **Robinson & Stokes NaCl Mean Activity (`0.1–4.0 mol/kg` at `298.15 K`):** Max absolute error in `gamma_+/-` across `{0.1, 0.5, 1.0, 2.0, 3.0, 4.0} mol/kg` is **`0.00067`** (`0.6572` vs `0.657` at `1.0 m`, `0.7832` vs `0.783` at `4.0 m`).
- **Gypsum Salting-In (`CaSO4*2H2O`):**
  - Pure water (`15.2 mM CaSO4`): Pitzer `SI = -0.013` (exact equilibrium); Davies `SI = +0.214`.
  - `3.0 m NaCl + 15.2 mM CaSO4`: Pitzer `SI = -1.079` (correctly undersaturated via salting-in); Davies falsely gives `SI = +2.322`.
  - `3.0 m NaCl + 55.0 mM CaSO4` (~`3.6x` pure-water solubility): Pitzer `SI = -0.009` (exact equilibrium); Davies falsely gives `SI = +3.628`.

### 3.3 Santoro et al. (2021) CNT & Mujahid et al. (2026)
- **Santoro CNT:** Reproduces monotone drop in `Delta_G*_het / (k_B T)` with increasing `Omega` (`1.5 -> 25`), crossing `40 k_B T` (Category B -> Category C) at lower supersaturation on hydrophilic CEM (`theta_0 = 55 deg`, `r = 1.2`) than hydrophobic AEM (`theta_0 = 85 deg`).
- **Mujahid et al. (2026):** Documented in `data/benchmark_cases/mujahid_2026_gypsum_silica_notes.json` (abstract-verified scope; paywalled full time-series tables not fabricated).

---

## 4. Dataset Conservation, Quality & Executed Case-Count Summary

- **Stage 1 (`data/clean_cases/`, 90 Sobol runs):** **85 converged**, **5 failed** (extreme low-velocity/high-ratio combinations with `mb_d = 2.10%–3.60%` exceeding strict `2.0%` gate, logged in `failure_log.csv`). Across all 85 valid cases: max HC error `0.334%`, max LC error `1.956%`, `P_net_max = 1.503–10.585 W/m2`.
- **Stage 2 (`data/multicomponent_brines/`, 48 structured runs):** **41 converged**, **7 failed** (all 7 occurred at extreme dilute `5 mM NaCl`, failing `100`-iter coupling tolerance, logged in `failure_log.csv`). Across all 41 valid 8-ion runs: max HC error `0.00171%`, max LC error `0.293%`, max electroneutrality residual **`1.51e-16`**, `OCV = 75.7–240.4 mV`. Note that vs `binary_eq`, `Shammas BWRO` (`267 mM`) exhibits `+33.4%` divalent-competition power loss, whereas hypersaline `Red Sea brine` (`1.38 M`) shows higher multicomponent OCV (`154 mV` vs `118 mV`) because the multicomponent config employs `10x` tighter co-ion/counter-ion diffusivity selectivity (`r_co/r_ct = 0.01` vs `0.10` in binary baseline) and quadratic Donnan exclusion of divalent `SO4^2-`.
- **Stage 3 (`data/scaling_risk/`):** **36 converged / 0 failed** (`18 Calcite`: `6` Undersaturated, `6` Near-equilibrium, `6` Supersaturated; `18 Gypsum`: `7` Undersaturated, `5` Near-equilibrium, `6` Supersaturated).
- **Stage 4 (`data/mineral_scaling/`):** **26 converged / 0 failed** (`18` CNT thermodynamic barrier sweeps spanning `3` Category A, `7` Category B, `8` Category C; `8` Exploratory fixed-`Delta_R_m` runs yielding `4.69%–35.08%` gross power reduction).

### Executed Case Counts Table

| Scenario Group                 | Existing Cases | New Cases | Converged Cases | Failed Cases |
| ------------------------------ | -------------: | --------: | --------------: | -----------: |
| Clean operating conditions     |             51 |        90 |              85 |            5 |
| Multicomponent brine           |              0 |        48 |              41 |            7 |
| Calcite saturation risk        |              0 |        18 |              18 |            0 |
| Gypsum saturation risk         |              0 |        18 |              18 |            0 |
| Mineral nucleation / benchmark |              0 |        26 |              26 |            0 |
| **Total (New Dataset v2.0.0)** |         **51** |   **200** |         **188** |       **12** |

*(Notes: Original `51` v1.0.0 cases remain untouched in `data/original_51_cases/`; all `51` repaired baseline cases also passed `51/51` in `data/repaired_baseline_51/`. `6` literature benchmark artifacts reside in `data/benchmark_cases/`.)*
