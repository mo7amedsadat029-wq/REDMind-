# Technical Report: Literature Review and Theoretical Foundation for RED Modeling

**Project:** REDMind — Reproducible Physics Simulator and Scientific Dataset Generator  
**Domain:** Reverse Electrodialysis (RED) Salinity Gradient Energy Conversion  
**Author / Engine:** REDMind Autonomous Scientific Agent  
**Date:** October 2026  

---

## 1. Executive Summary

Reverse Electrodialysis (RED) is an electrochemical membrane process that harvests Gibbs free energy of mixing between solutions of differing salinity (e.g., seawater and river water, or hypersaline industrial brines and brackish water). This review examines the governing multi-physical laws, published mathematical formulations, and engineering compromises required to construct an executable, verifiable, and numerically rigorous 2D reference simulator.

The primary target model is selected as **Gurreri et al. (2017)** (*Desalination*, 423, 52–64), which models a 2D periodic unit cell pair combining Navier–Stokes hydrodynamics, species transport via the Nernst–Planck equations, Donnan interfacial equilibrium, and electroneutrality. To complement and validate this spatial model, we incorporate membrane transport theories from **Tedesco et al. (2016)**, stack-level lump-parameter scaling laws from **Long et al. (2018)**, surrogate/CFD benchmarks from **Faghihi & Jalali (2022)**, and scaling/fouling thermodynamics from **Santoro et al. (2021)** and **Parkhurst & Appelo (2013)**.

---

## 2. Review of Primary Literature

### 2.1 Primary Model: Gurreri et al. (2017)
- **Citation:** Gurreri, L., Battaglia, G., Tamburini, A., Cipollina, A., Micale, G., and Ciofalo, M. (2017). "Multi-physical modelling of reverse electrodialysis." *Desalination*, 423, 52–64. DOI: 10.1016/j.desal.2017.09.006.
- **Scope & Geometry:** 2D periodic portion of an RED cell pair consisting of one concentrated (HC) channel, one dilute (LC) channel, and separating ion-exchange membranes (Cation Exchange Membrane, CEM; Anion Exchange Membrane, AEM). Three channel configurations were investigated: (1) empty flat channels, (2) channels with non-conductive net spacers, and (3) profiled membranes.
- **Governing Equations:**
  1. *Continuity & Navier–Stokes (laminar, incompressible):*
     $$\nabla \cdot \mathbf{u} = 0$$
     $$\rho (\mathbf{u} \cdot \nabla)\mathbf{u} = -\nabla p + \mu \nabla^2 \mathbf{u} + \mathbf{F}_e$$
     In practice, body force $\mathbf{F}_e = \rho_e \nabla \Phi \approx 0$ due to bulk electroneutrality.
  2. *Nernst–Planck Species Transport:*
     $$\mathbf{J}_i = -D_i \nabla c_i - \frac{z_i F}{RT} D_i c_i \nabla \Phi + c_i \mathbf{u}$$
     $$\nabla \cdot \mathbf{J}_i = 0 \quad (\text{steady state, non-reactive})$$
  3. *Electroneutrality Constraint:*
     $$\sum z_i c_i = 0 \implies c_{\text{Na}^+} = c_{\text{Cl}^-} = c$$
  4. *Donnan Interfacial Boundary Conditions:*
     $$\Delta \Phi_{\text{Donnan}} = -\frac{RT}{z_i F} \ln\left(\frac{\gamma_i^m c_i^m}{\gamma_i^s c_i^s}\right)$$
- **Reproducible Baseline Case:** Flat-membrane, empty-channel geometry. This avoids empirical spacer geometry ambiguities while preserving full boundary layer development, concentration polarization, and trans-membrane electro-diffusive flux.
- **Known Limitations & Missing Parameters in Literature:** Full commercial membrane tortuosity and exact non-ideal activity corrections in concentrated brine are omitted or simplified in 2D finite-element packages. In the present work, ideal Donnan partitioning with effective counter/co-ion membrane diffusivities is implemented and audited.

### 2.2 Membrane Ion Transport: Tedesco et al. (2016)
- **Citation:** Tedesco, M., Hamelers, H. V. M., and Biesheuvel, P. M. (2016). "Nernst–Planck transport theory for (reverse) electrodialysis: I. Effect of co-ion transport through the membranes." *Journal of Membrane Science*, 510, 370–381. DOI: 10.1016/j.memsci.2016.03.012.
- **Key Contributions:**
  1. Explicitly formulates co-ion exclusion and leakage through ion-exchange membranes as a function of external salinity and membrane fixed charge density $X_{\text{fix}}$.
  2. Demonstrates that for a 1:1 electrolyte (NaCl), Donnan equilibrium yields internal membrane co-ion concentration:
     $$c_{\text{co}}^m = -\frac{|X_{\text{fix}}|}{2} + \sqrt{\left(\frac{X_{\text{fix}}}{2}\right)^2 + c_s^2}$$
     $$c_{\text{ct}}^m = |X_{\text{fix}}| + c_{\text{co}}^m$$
  3. Donnan-based apparent permselectivity $\alpha$ is given by:
     $$\alpha = \frac{|X_{\text{fix}}|}{|X_{\text{fix}}| + 2 c_{\text{co}}^m}$$
     At low salt concentration ($c_s \ll |X_{\text{fix}}|$), $\alpha \to 1.0$; as $c_s$ approaches $|X_{\text{fix}}|$, co-ion screening degrades permselectivity significantly.

### 2.3 Stack-Level Hydrodynamics & Power: Long et al. (2018)
- **Citation:** Long, R., Li, B., Liu, Z., and Liu, W. (2018). "Performance analysis of reverse electrodialysis stacks: Channel geometry and flow rate optimization." *Energy*, 158, 427–436. DOI: 10.1016/j.energy.2018.06.067.
- **Model Character:** Lumped 1D / algebraic stack model.
- **Key Formulations:**
  1. *Stack Open-Circuit Voltage (OCV):*
     $$E_{\text{OCV}} = N_{\text{cp}} (\alpha_{\text{CEM}} + \alpha_{\text{AEM}}) \frac{RT}{F} \ln\left(\frac{c_{\text{HC}}}{c_{\text{LC}}}\right)$$
  2. *Internal Area Resistance:*
     $$R_{\text{int}} = N_{\text{cp}} \left( \frac{h_{\text{HC}}}{\sigma_{\text{HC}}} + \frac{h_{\text{LC}}}{\sigma_{\text{LC}}} + R_{\text{CEM}} + R_{\text{AEM}} \right) + R_{\text{el}}$$
  3. *Gross Power & Pumping Parasitic Losses:*
     $$P_{\text{gross,max}} = \frac{E_{\text{OCV}}^2}{4 R_{\text{int}}}$$
     $$P_{\text{pump}} = \frac{\Delta p_{\text{HC}} Q_{\text{HC}}}{\eta_{\text{pump}}} + \frac{\Delta p_{\text{LC}} Q_{\text{LC}}}{\eta_{\text{pump}}}$$
     $$P_{\text{net}} = P_{\text{gross}} - P_{\text{pump}}$$
- **Critical Distinction:** Long et al. neglect concentration polarization ($c_{\text{wall}} \approx c_{\text{bulk}}$), which over-predicts OCV and under-predicts resistance compared to spatially resolved models.

### 2.4 CFD & Machine Learning Landscape: Faghihi & Jalali (2022)
- **Citation:** Faghihi, P., and Jalali, A. (2022). "An artificial neural network-based optimization of reverse electrodialysis power generating cells using CFD and genetic algorithm." *International Journal of Energy Research*, 46(15), 21217–21233. DOI: 10.1002/er.8379.
- **Findings:** Demonstrated that 2D CFD datasets can successfully train surrogate neural networks across velocity ($0.5$ to $5\text{ cm/s}$) and channel geometries. Emphasized that accurate training data must preserve local boundary-layer gradients at membrane walls to avoid systematic bias in power predictions.

### 2.5 Mineral Scaling & Fouling: Santoro et al. (2021)
- **Citation:** Santoro, S., Tufa, R. A., Avci, A. H., Fontananova, E., Di Profio, G., and Curcio, E. (2021). "Fouling propensity in reverse electrodialysis operated with hypersaline brine." *Energy*, 228, 120563. DOI: 10.1016/j.energy.2021.120563.
- **Mechanisms:**
  - Calcium carbonate ($\text{CaCO}_3$, calcite) is identified as the primary mineral scaling threat in RED.
  - CEM surfaces are preferentially scaled by divalent cations ($\text{Ca}^{2+}$) which act as counter-ions and concentrate inside/at the CEM interface.
  - Thermodynamic driving force is governed by the Saturation Index (SI):
    $$\text{SI} = \log_{10} \Omega = \log_{10}\left(\frac{\{\text{Ca}^{2+}\} \{\text{CO}_3^{2-}\}}{K_{\text{sp}}}\right)$$
    where braces denote ionic activities ($\{i\} = \gamma_i m_i$).

---

## 3. Comparative Summary: Spatial CFD vs. Lumped Stack Models

| Feature | Gurreri et al. (2017) Spatial 2D | Long et al. (2018) Lumped 1D |
| :--- | :--- | :--- |
| **Flow Resolution** | 2D parabolic / Navier–Stokes | 1D Darcy friction factor |
| **Concentration Polarization** | Fully resolved ($c_{\text{wall}}(x) < c_{\text{bulk}}(x)$) | Ignored ($c_{\text{wall}} \equiv c_{\text{bulk}}$) |
| **Donnan Boundary Conditions** | Local Donnan jump at every $x$ | Global lumped permselectivity $\alpha$ |
| **Internal Resistance** | Integrates local electrolyte conductivity | Evaluated at inlet/mean concentration |
| **Output Capabilities** | Local $c(x,y)$, $\Phi(x,y)$, $u(x,y)$, $J_{\text{salt}}(x)$ | Global $E_{\text{OCV}}$, $R_{\text{int}}$, $P_{\text{net}}$ |
| **PINN Training Utility** | **High** (provides field-level PDEs & BCs) | None (scalar outputs only) |

---

## 4. Mineral Scaling Modeling Strategy

Mineral scaling is treated as an explicit thermodynamic post-processing diagnostic:
1. Calcite equilibrium: $\text{CaCO}_3(\text{s}) \rightleftharpoons \text{Ca}^{2+} + \text{CO}_3^{2-}$ with $\log_{10} K_{\text{sp}} = -8.48$ at $298.15\text{ K}$.
2. Ion activity coefficients computed via the Davies equation (valid up to $I \approx 0.5\text{ M}$) or extended Debye–Hückel formulation:
   $$\log_{10} \gamma_i = -A z_i^2 \left( \frac{\sqrt{I}}{1 + B a_i \sqrt{I}} - b I \right)$$
3. Local $\text{SI}(x)$ evaluated directly at the membrane interface coordinates $(x, y=0)$ and $(x, y=h)$.
