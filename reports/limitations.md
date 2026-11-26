# Scientific Limitations and Scope Boundaries — REDMind v2.0.0

This document establishes explicit scientific boundaries, modeling assumptions, and non-fabrication guarantees in strict accordance with Sections 4, 6, 7, 8, 9, and 16 of the project specification.

---

## 1. Thermodynamic Saturation vs. Mineral Deposition Kinetics
- **Supersaturation Is Not Actual Deposition:** Stage 2 wall Saturation Indices and Stage 3 (`sr_calcite_*`, `sr_gypsum_*`) quantify the thermodynamic driving force (`Omega = IAP / K_sp`, `SI = log10 Omega`) via **one-way coupled post-processing** using USGS `pitzer.dat`. Positive `SI` identifies a chemical scaling risk (*Category B*), **not** mass precipitation or membrane blockage.
- **No Uncalibrated Crystal Growth Laws:** Neither Santoro et al. (2021) nor Mujahid et al. (2026) provides a complete, parameterized 2D time-dependent RED crystal-growth rate equation (`dm_deposit / dt`, active nucleation site density `A_het`, and pore-blockage permeability evolution). Therefore:
  - No kinetic growth constants, time-to-failure curves, or synthetic `deposit_thickness_um(t)` trajectories are fabricated.
  - **Category D (`Confirmed or modeled deposition`) is never assigned** anywhere in the v2.0.0 dataset.

## 2. Heterogeneous Nucleation Scope (CNT)
- **Propensity Only:** `src/nucleation_model.py` solves Classical Nucleation Theory (CNT) thermodynamic quantities (`r*`, `Delta_G*_hom`, `f(theta_eff)`, `Delta_G*_het / (k_B T)`, and normalized Boltzmann factor `exp(-Delta_G*_het / k_B T)`) classifying states into **Category A** (`Clean membrane`), **Category B** (`Scaling-risk condition`), or **Category C** (`Nucleation-prone condition`, `Delta_G*_het / (k_B T) <= 40`).
- **Pre-Exponential Kinetic Factor Omitted:** True nucleation rates `J_nuc = A_het * exp(-Delta_G*_het / k_B T)` depend on poorly constrained surface diffusivity and hydration barriers (`A_het`); only the dimensionless thermodynamic barrier and Boltzmann propensity are reported.
- **Surface Charge Proxy:** `surface_charge_C_m2_proxy` and `relative_permittivity` are recorded explicitly as sensitivity parameters/proxies reflecting CEM vs AEM hydrophilicity, not coupled Gouy–Chapman interfacial dielectric saturation inside the electrical double layer.

## 3. Exploratory Fixed-Resistance Sensitivity Scenarios (`ms_sens_001..008`)
- Cases `ms_sens_001` through `ms_sens_008` apply hypothetical fixed area-resistance increments `Delta_R_m in {+0.5, +1.5, +3.0, +6.0} Ohm*cm^2` to the clean binary and Mediterranean brine baseline models.
- They are tagged strictly as **`Exploratory sensitivity scenario`** to quantify theoretical electrical sensitivity to resistive membrane blockage; they are **not** physically validated fouling trajectories, and electrical power reduction alone cannot identify whether resistance changes stem from scaling, biofouling, or spacer compaction.

## 4. Literature Access & Incomplete Experimental Data Constraints
- **Mujahid et al. (2026) Paywall Constraint:** Only abstract-level findings from *Separation and Purification Technology* 390, 136960 (gypsum and amorphous silica impurity impacts on RED) are accessible without institutional paywall access. Experimental time-series tables are **not** digitized from thin abstracts or back-fitted into synthetic kinetics; the study is preserved as a benchmark reference note (`data/benchmark_cases/mujahid_2026_gypsum_silica_benchmark.json`).
- **Santoro et al. (2024) Incomplete Brine Exclusion:** `hypersaline_swro_santoro_2024_ic` (*Membranes* 14(4), 87, Table 1) omits `HCO3-` and `pH` and shows a `+13.8%` raw charge-balance excess. It is audited in `data/metadata/brine_audit.csv` (`included_in_transport_pde = False`) and **excluded** from Stage 2 PDE simulations to avoid fabricating missing carbonate species.

## 5. Excluded Fouling Mechanisms
- **Mineral Scaling Only:** Per Section 4, organic fouling (alginate/humic substances), colloidal/amorphous silica polymerization, particulate deposition, and biofouling observed in natural waters (Vermaas et al., 2013) are **excluded** from numerical implementation.

## 6. Aqueous Activity & Transport Model Simplifications
- **Davies Breakdown at High Salinity:** The classical Davies equation (`A_dh z^2 (sqrt(I)/(1+sqrt(I)) - 0.3 I)`) loses validity above `I > 0.5 mol/kg`. All multicomponent desalination brines (`I = 0.29–1.66 mol/kg`) rely on the USGS `pitzer.dat` HMW formulation for saturation indices; Davies values are stored strictly with `davies_validity_flag = invalid_high_ionic_strength_I>0.5` for diagnostic comparison.
- **Channel Transport Closure:** The 2D Nernst–Planck PDEs use dilute-solution Stokes–Einstein tracer diffusivities (`D_k(T)`) and ideal Donnan partitioning inside membranes (`gamma_k^m / gamma_k^s = 1`), neglecting concentrated Maxwell–Stefan ion–ion friction, osmotic water drag across membranes (`v_water = 0`), and pH spatial drift from water dissociation (`H+`/`OH-` transport) along the channel.
- **Flat Empty Channels:** Hydrodynamics assume spacer-free 2D plane Poiseuille channels (`Gurreri et al., 2017` empty-channel benchmark); commercial woven-spacer shadow factors and Sherwood mass-transfer enhancement are intentionally excluded to maintain zero free geometric turbulence tuning parameters.
