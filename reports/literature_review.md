# Literature Review and Theoretical Foundation — REDMind v2.0.0

**Project:** REDMind v2.0.0 — Reproducible Multi-Physics RED Simulator & Desalination-Brine Scaling Benchmark  
**Scope:** Reverse Electrodialysis (RED) hydrodynamics, binary & multicomponent Nernst–Planck transport, Pitzer aqueous geochemistry, Classical Nucleation Theory (CNT) heterogeneous nucleation, and desalination-brine benchmarks.  
**Policy:** Strictly zero fabricated equations, kinetic fouling growth constants, or unobserved analytical concentrations.

---

## 1. RED Transport & Multiphysics Foundations

### 1.1 Gurreri et al. (2017) — Primary 2D Spatial Cell-Pair Model
- **Citation:** Gurreri, L., Battaglia, G., Tamburini, A., Cipollina, A., Micale, G., & Ciofalo, M. (2017). "Multi-physical modelling of reverse electrodialysis." *Desalination*, 423, 52–64. DOI: `10.1016/j.desal.2017.09.006`.
- **Role in REDMind v2.0.0:** Primary physical benchmark for flat-membrane, empty-channel 2D periodic RED unit cell pairs (`h = 270 um`, `L = 10 cm`, `delta_m = 125 um`, `500/17 mol/m^3 NaCl`, `u = 1.0 cm/s`, `T = 298.15 K`).
- **Key Physics:** Couples incompressible laminar Navier–Stokes flow, steady Nernst–Planck species advection–diffusion–migration, local electroneutrality, and local Donnan equilibrium interfacial boundaries. Resolves transverse concentration polarization boundary layers along CEM and AEM walls (`c_wall(x) != c_bulk(x)`), capturing polarization OCV depression and boundary-layer resistance omitted in lumped 1D models.
- **v2.0 Repair Verified:** Original v1.0.0 inverted the bottom-wall CEM Neumann flux sign on the HC side; v2.0 restores physically consistent depletion on HC walls (`c_min = 499.81 mol/m^3`) and enrichment on LC walls (`c_max = 17.19 mol/m^3`) with exact mass balance (`< 0.04%` across 51 baseline cases).

### 1.2 Tedesco, Hamelers, & Biesheuvel (2016) — Co-Ion Leakage & Membrane Transport
- **Citation:** Tedesco, M., Hamelers, H. V. M., & Biesheuvel, P. M. (2016). "Nernst–Planck transport theory for (reverse) electrodialysis: I. Effect of co-ion transport through the membranes." *Journal of Membrane Science*, 510, 370–381. DOI: `10.1016/j.memsci.2016.03.012`.
- **Role in REDMind v2.0.0:** Basis for finite membrane fixed charge density (`|X_fix| = 2000 mol/m^3` baseline, swept `1500–4000 mol/m^3`), analytical binary Donnan partitioning, multi-ion Donnan equilibrium solver, co-ion leakage flux, and apparent permselectivity degradation under high salinity (`c_s -> |X_fix|`). Also guides intra-membrane counter-ion vs co-ion diffusivity ratios and divalent ion retardation (`Mg2+`, `Ca2+`, `SO4^2-`, `CO3^2-`).

### 1.3 Long et al. (2018) — Stack Geometry, Flow Rate Optimization & Hydraulic Loss
- **Citation:** Long, R., Li, B., Liu, Z., & Liu, W. (2018). "Performance analysis of reverse electrodialysis stacks: Channel geometry and flow rate optimization." *Energy*, 158, 427–436. DOI: `10.1016/j.energy.2018.06.067`.
- **Role in REDMind v2.0.0:** Guides velocity sweep range (`0.3–4.5 cm/s`), plane-Poiseuille hydraulic pressure drop (`Delta_p = 12 mu u L / h^2`), pumping power (`P_pump = sum Delta_p * Q / (eta_pump * A)` with `eta_pump = 0.75`), and net power trade-off (`P_net = P_gross - P_pump`).
- **Identified Assumption:** Lumped 1D framework neglects concentration polarization boundary layers (`c_wall == c_bulk`), systematically predicting higher OCV and lower resistance than spatially resolved 2D CFD at low flow rates.

---

## 2. Realistic Desalination-Brine Chemistry

### 2.1 Sorour et al. (2015) & Coastal Egyptian RO Audits
- **Citations:**
  - Sorour, M. H., Hani, H. A., Al-Bazedi, G. A., & El-Rafei, A. M. (2015). "Schemes for salt recovery from seawater and RO brines using chemical precipitation." *Desalination and Water Treatment*, 55(9), 2398–2407. DOI: `10.1080/19443994.2014.946720`.
  - Abdel-Aal, E. A. et al. (2021). *Membranes*, 11(3), 212 (`PMC8002872`, Tables 1–2: El-Remel Mediterranean SWRO feed/brine & Shammas brackish RO reject).
  - TDA Egypt Coastal Desalination Environmental Audit (Red Sea SWRO feed & reject brine).
  - SWRO-PRO Mediterranean Seawater study (2022), *Membranes*, 12(11), 1045 (`PMC9694509`, Table 2).
- **Brine Audit Findings:**
  - Six documented desalination streams possess complete 8-major-ion speciation (`Na+, K+, Mg2+, Ca2+, Cl-, SO4^2-, HCO3-, CO3^2-`, with `CO3^2-` thermodynamically derived from measured `HCO3-` and `pH` in the two TDA Red Sea audits) and pass charge balance (`|CBE_raw| <= 3.7%`, exactly balanced by minimal counter-ion `Na+/Cl-` adjustment prior to PDE solve).
  - **Excluded Incomplete Profile:** `hypersaline_swro_santoro_2024_ic` (*Membranes* 14(4), 87, 2024, `PMC11052490` Table 1) omits `HCO3-` and `pH` and exhibits a `13.8%` raw cation excess in its IC analysis. Per Section 6 strict integrity rules, it is retained in `brine_audit.csv` as `incomplete_missing_HCO3_and_pH` and excluded from multicomponent transport PDE runs.

### 2.2 Total Resource Circulation of Desalination Brine (2024)
- **Citation:** "Total Resource Circulation of Desalination Brine: A Review" (2024). *Advanced Sustainable Systems*, DOI: `10.1002/adsu.202300460`.
- **Relevance:** Contextualizes regional TDS variation (`15–89 g/L`), elevated `Mg2+/Ca2+` hardness in Mediterranean and Red Sea RO concentrates (`860–2878 mg/L Mg2+`, `450–891 mg/L Ca2+`), and underscores why divalent-ion selectivity loss (`uphill/downhill` co-transport and Donnan partitioning competition) suppresses RED power density relative to equivalent-ionic-strength NaCl solutions.

---

## 3. High-Ionic-Strength Aqueous Chemistry (PHREEQC & Pitzer)

### 3.1 Plummer et al. (1988) & Parkhurst & Appelo (2013)
- **Citations:**
  - Plummer, L. N., Parkhurst, D. L., Fleming, G. W., & Dunkle, S. A. (1988). "A computer program incorporating Pitzer's equations for calculation of geochemical reactions in brines." *USGS Water-Resources Investigations Report 88-4153* (`PHRQPITZ`). DOI: `10.3133/wri884153`.
  - Parkhurst, D. L., & Appelo, C. A. J. (2013). "Description of Input and Examples for PHREEQC Version 3." *USGS Techniques and Methods*, Book 6, Chapter A43. DOI: `10.3133/tm6A43`.
- **Role in REDMind v2.0.0:**
  - Provides the complete Harvie–Moller–Weare (HMW, 1984) Pitzer virial ion-interaction parameterization (`USGS pitzer.dat`, extracted cleanly in `configs/pitzer_parameters.json`) covering `Na+, K+, Mg2+, Ca2+, H+, Cl-, SO4^2-, HSO4-, HCO3-, CO3^2-, OH-, MgCO3(0)`.
  - Demonstrates why Davies activity corrections (`A sqrt(I)/(1+sqrt(I)) - 0.3 I`) fail systematically for RO brines where `I > 0.5 mol/kg` (e.g., Red Sea reject brine reaches `I = 1.66 mol/kg`), reversing or severely distorting Gypsum NaCl salting-in and Calcite saturation predictions.
  - Benchmark targets verified against Robinson & Stokes tabulated NaCl mean ionic activity coefficients (`0.1–4.0 mol/kg`) and classic NaCl–CaSO4 gypsum salting-in equilibria.

---

## 4. RED-Specific Mineral Scaling and Fouling

### 4.1 Vermaas et al. (2013) — Natural Fouling Mechanisms
- **Citation:** Vermaas, D. A., Kunteng, D., Saakes, M., & Nijmeijer, K. (2013). "Fouling in reverse electrodialysis under natural conditions." *Water Research*, 47(3), 1289–1298. DOI: `10.1016/j.watres.2012.11.053`.
- **Scope Boundary:** Documents combined inorganic (scaling), organic (humics/alginate), colloidal (clay/silica), and biological fouling in natural river/seawater feeds. Following Section 4 of the project scope, REDMind v2.0.0 isolates **inorganic mineral scaling thermodynamics and CNT nucleation only** (`CaCO3` and `CaSO4*2H2O`) and does not fabricate unvalidated organic, colloidal, or biological fouling kinetics.

### 4.2 Santoro et al. (2021) — Calcite Heterogeneous Nucleation in RED
- **Citation:** Santoro, S., Tufa, R. A., Avci, A. H., Fontananova, E., Di Profio, G., & Curcio, E. (2021). "Fouling propensity in reverse electrodialysis operated with hypersaline brine." *Energy*, 228, 120563. DOI: `10.1016/j.energy.2021.120563`.
- **Implemented Physics:** Classical Nucleation Theory (CNT) heterogeneous free-energy barrier `Delta_G*_het = f(theta_eff) * Delta_G*_hom` incorporating intrinsic membrane–water contact angle `theta_0`, Wenzel surface roughness `r` (`cos theta_eff = r cos theta_0`), mineral–water interfacial tension `gamma_sl`, mineral molar volume `V_m`, temperature `T`, and Pitzer supersaturation ratio `Omega = IAP / K_sp`.
- **CEM vs AEM Contrast:** CEMs preferentially attract divalent `Ca2+` as counter-ions and exhibit more hydrophilic surfaces (`theta_0 ~ 55 deg` vs `~65–85 deg` on typical AEMs), lowering `f(theta_eff)` and `Delta_G*_het`.
- **Boundary of Validity:** Evaluates *nucleation propensity* (`Category A/B/C`) and thermodynamic barrier height `Delta_G*_het / (k_B T)` rather than an uncalibrated kinetic pre-exponential `A_het` or time-dependent crystal-thickness trajectory (`Category D` intentionally omitted).

### 4.3 Mujahid et al. (2026) — Gypsum and Silica Impurity Benchmark
- **Citation:** Mujahid, M. et al. (2026). "Investigation of the effect of gypsum and silica impurity in saline feed water on the RED performance." *Separation and Purification Technology*, 390, 136960. DOI: `10.1016/j.seppur.2026.136960`.
- **Evidence Audit:** Full experimental time-series tables in this newly published 2026 article remain behind the publisher paywall (abstract-verified only). Therefore, REDMind v2.0.0 records it strictly as a qualitative/abstract-level benchmark citation (`data/benchmark_cases/mujahid_2026_gypsum_silica_benchmark.json`), separates thermodynamic Gypsum saturation regimes (`Stage 3`) from amorphous silica polymerization (not modeled dynamically), and treats fixed-`Delta_R_m` membrane resistance increments exclusively as `Exploratory sensitivity scenario` (`Stage 4 Part B`).
