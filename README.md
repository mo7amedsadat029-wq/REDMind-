# REDMind v2.0.0: Reproducible Multi-Physics RED Simulator & Mineral Scaling Dataset

**REDMind v2.0.0** is an open, CPU-compatible 2D computational physics simulator and benchmark dataset generator for Reverse Electrodialysis (RED) operating across clean binary NaCl feeds, realistic 8-ion Mediterranean/Red Sea/brackish desalination brines, high-salinity USGS `pitzer.dat` mineral saturation regimes, and Classical Nucleation Theory (CNT) heterogeneous nucleation barriers.

> **Scope Policy:** Strictly physics-based numerical simulation and thermodynamic post-processing. **No PINN, neural network, or ML models are trained**, and no uncalibrated kinetic crystal-growth rates, deposit thickness trajectories, or missing brine concentrations are fabricated. The original 51 baseline cases remain strictly preserved in `data/original_51_cases/`.

---

## 1. Repository Layout

```
REDMind/
├── configs/
│   ├── default_config.py               # Baseline binary physical & geometric parameters
│   ├── clean_operating_cases.yaml      # Stage 1 Sobol operating bounds (seed=2026)
│   ├── brine_profiles.yaml             # 7 documented RO brine profiles (6 complete/speciated + 1 audit-only)
│   ├── multicomponent_transport.yaml   # 8-ion tracer D_k (pitzer.dat) & membrane transport parameters
│   ├── calcite_scaling.yaml            # Calcite Pitzer & Santoro (2021) CNT parameters
│   ├── gypsum_scaling.yaml             # Gypsum Pitzer & Mujahid (2026) benchmark notes
│   └── pitzer_parameters.json          # Extracted USGS PHREEQC pitzer.dat virial coefficients
├── src/
│   ├── reference_simulator.py          # Repaired 2D binary NaCl Nernst-Planck + Donnan solver
│   ├── multicomponent_transport.py     # 8-ion 2D Nernst-Planck + bracketed Donnan + vectorized GHK solver
│   ├── pitzer_model.py                 # USGS pitzer.dat Harvie-Moller-Weare (HMW) activity & Ksp module
│   ├── nucleation_model.py             # Santoro (2021) CNT heterogeneous nucleation barrier classifier
│   ├── sampling_v2.py                  # Stage 1 Sobol QMC sampling design
│   ├── dataset_writer_v2.py            # Compressed NPZ & schema-standardized CSV/JSON exporters
│   └── verification.py / validation.py # 10 mandatory verification tests + Gurreri/Long validation
├── data/
│   ├── original_51_cases/              # Original v1.0.0 baseline 51 cases (STRICTLY UNTOUCHED)
│   ├── repaired_baseline_51/           # Regenerated baseline 51 cases with repaired CEM wall BC
│   ├── clean_cases/                    # Stage 1: 85 converged Sobol binary cases (60x25 grid)
│   ├── multicomponent_brines/          # Stage 2: 41 converged 8-ion 2D brine cases + Pitzer wall SI
│   ├── scaling_risk/                   # Stage 3: 36 Calcite & Gypsum Pitzer saturation-risk cases (3 regimes)
│   ├── mineral_scaling/                # Stage 4: 18 CNT nucleation + 8 Exploratory Delta-R_m sensitivity cases
│   ├── benchmark_cases/                # 6 literature benchmark tables (Gurreri, Long, Pitzer, Santoro, Mujahid)
│   └── metadata/                       # Unified manifest.json, simulation_summary.csv, failure_log.csv, brine_audit.csv
├── reports/
│   ├── literature_review.md            # Expanded v2.0.0 literature synthesis
│   ├── model_specification.md          # Complete governing PDEs, Donnan-GHK, Pitzer, and CNT equations
│   ├── parameter_provenance.csv        # Full traceability table of physical, transport & scaling parameters
│   ├── simulation_summary.csv          # Unified metadata table across all v2.0.0 cases
│   ├── validation_report.md            # Baseline repair comparison, benchmarks & conservation checks
│   └── limitations.md                  # Explicit non-fabrication & Category A/B/C/D scope boundaries
├── results/figures/                    # 15 publication-grade figures (fig01..fig15)
├── scripts/
│   ├── generate_expanded_dataset.py    # Master reproducible v2.0.0 dataset & benchmark pipeline
│   └── export_figures_v2.py            # Generates all 15 labeled v2.0.0 scientific figures
└── tests/                              # 25 automated pytest physics, Pitzer, CNT & dataset schema tests
```

---

## 2. Reproducible Execution Instructions

```bash
pip install -r requirements.txt

# 1. Run core verification & literature validation
PYTHONPATH=. python3 scripts/run_verification.py
PYTHONPATH=. python3 scripts/run_validation.py

# 2. Generate full REDMind v2.0.0 dataset (repaired baseline + Stages 1-4 + benchmarks)
PYTHONPATH=. python3 -u scripts/generate_expanded_dataset.py

# 3. Export all 15 scientific figures into results/figures/
PYTHONPATH=. python3 -u scripts/export_figures_v2.py

# 4. Run full automated verification & schema test suite (25 tests)
PYTHONPATH=. pytest tests/ -v
```

---

## 3. Executed Case-Count Summary (Actual Pipeline Outputs)

| Scenario Group                 | Existing Cases | New Cases | Converged Cases | Failed Cases |
| ------------------------------ | -------------: | --------: | --------------: | -----------: |
| Clean operating conditions     |             51 |        90 |              85 |            5 |
| Multicomponent brine           |              0 |        48 |              41 |            7 |
| Calcite saturation risk        |              0 |        18 |              18 |            0 |
| Gypsum saturation risk         |              0 |        18 |              18 |            0 |
| Mineral nucleation / benchmark |              0 |        26 |              26 |            0 |
| **Total (New Dataset v2.0.0)** |         **51** |   **200** |         **188** |       **12** |

- **Preserved Original Baseline:** `51` cases untouched in `data/original_51_cases/`.
- **Repaired Baseline Regeneration:** `51/51` converged cleanly in `data/repaired_baseline_51/` (`max LC mass-balance error` reduced `33.1x` from `3.40%` to `0.103%`).
- **Failed Runs Isolation:** All `12` non-converged or >2%-error runs (`5` extreme Stage 1 + `7` extreme `5 mM` dilute Stage 2 cases) are excluded from training metadata and documented in `data/metadata/failure_log.csv`.
- **Incomplete Brine Exclusion:** `hypersaline_swro_santoro_2024_ic` (missing `HCO3-` & `pH`, `+21.9%` CBE) is audited in `data/metadata/brine_audit.csv` (`included_in_transport_pde = False`) and excluded from transport solves.
- **Automated Verification:** **25/25 `pytest` tests passed in 3.28 s**.
