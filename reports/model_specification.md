# Mathematical Model Specification — REDMind v2.0.0

**Model Versions Covered:**
- `REDMind-2D-Binary-v2.0` (Repaired 2D binary NaCl unit cell pair)
- `REDMind-2D-Multicomponent-v2.0` (8-ion 2D Nernst–Planck + Donnan + GHK transport)
- `REDMind-Pitzer-HMW-v2.0` (USGS `pitzer.dat` Harvie–Moller–Weare thermodynamics)
- `REDMind-CNT-Santoro2021-v2.0` (Heterogeneous nucleation barrier classifier)

---

## 1. Computational Geometry & Coordinate System

Each unit cell pair comprises a high-concentration channel (HC) and low-concentration channel (LC) of length `L` and height `h`:
- Axial coordinate: `x in [0, L]` (`L_ref = 0.10 m`), `nx` nodes (`60` in Stage 1, `50` in Stage 2).
- Transverse coordinate per channel: `y in [0, h]` (`h_ref = 270 um`), `ny` nodes (`25` in Stage 1, `20` in Stage 2).
- **Channel wall mapping:**
  - Concentrated channel (HC): bottom wall `y = 0` is **CEM**; top wall `y = h` is **AEM**.
  - Dilute channel (LC): top wall `y = h` is **CEM**; bottom wall `y = 0` is **AEM**.
- Fluid properties scale with temperature `T` via Vogel dynamic viscosity `mu(T)` (`8.90e-4 Pa*s` at `298.15 K`) and Stokes–Einstein diffusivity scaling `D_k(T) = D_k(298.15 K) * (T / 298.15) * (mu_25C / mu(T))`.

---

## 2. Hydrodynamics (Analytical Plane Poiseuille Flow)

Incompressible, steady, laminar flow (`Re < 50`, negligible hydrodynamic entrance length `< 0.5 mm`):
$$u(y) = 6 \bar{u} \frac{y(h - y)}{h^2}, \qquad v(x, y) = 0$$
$$\Delta p = \frac{12 \mu(T) \bar{u} L}{h^2}, \qquad \text{Re} = \frac{\rho \bar{u} (2h)}{\mu(T)}$$

---

## 3. Binary 2D NaCl Model (`REDMind-2D-Binary-v2.0`)

Under local electroneutrality (`c_Na+ = c_Cl- = c`), the steady 2D Nernst–Planck PDE reduces to:
$$u(y) \frac{\partial c}{\partial x} = D_{\text{eff}} \left(\frac{\partial^2 c}{\partial x^2} + \frac{\partial^2 c}{\partial y^2}\right), \qquad D_{\text{eff}} = \frac{2 D_{\text{Na}} D_{\text{Cl}}}{D_{\text{Na}} + D_{\text{Cl}}}$$
- **Diffusion Potential:**
$$\nabla \Phi = -\frac{RT}{F} \left(\frac{D_{\text{Na}} - D_{\text{Cl}}}{D_{\text{Na}} + D_{\text{Cl}}}\right) \frac{\nabla c}{c}$$
- **Analytical Binary Donnan Partitioning (Tedesco et al., 2016):**
$$c_{\text{co}}^m = -\frac{|X_{\text{fix}}|}{2} + \sqrt{\left(\frac{X_{\text{fix}}}{2}\right)^2 + c_{\text{sol}}^2}, \qquad c_{\text{ct}}^m = |X_{\text{fix}}| + c_{\text{co}}^m$$
- **v2.0 Repaired Membrane-Wall Neumann Flux BCs:**
  Flux magnitude across CEM/AEM (`HC -> LC` positive salt transfer `J_salt > 0`):
  $$-D_{\text{eff}} \left.\frac{\partial c_{\text{HC}}}{\partial y}\right|_{y=0} = -J_{\text{CEM}}, \quad +D_{\text{eff}} \left.\frac{\partial c_{\text{HC}}}{\partial y}\right|_{y=h} = -J_{\text{AEM}}$$
  $$+D_{\text{eff}} \left.\frac{\partial c_{\text{LC}}}{\partial y}\right|_{y=h} = +J_{\text{CEM}}, \quad -D_{\text{eff}} \left.\frac{\partial c_{\text{LC}}}{\partial y}\right|_{y=0} = +J_{\text{AEM}}$$
  *(Note: In v1.0.0, the HC bottom-wall sign at `y=0` was accidentally flipped `+J_CEM`, creating unphysical HC boundary enrichment; repaired in v2.0 so HC depletes and LC enriches on every membrane wall.)*

---

## 4. Multicomponent 8-Ion Model (`REDMind-2D-Multicomponent-v2.0`)

**Species Vector (`k = 1..8`):** `Na+, K+, Mg2+, Ca2+, Cl-, SO4^2-, HCO3-, CO3^2-`.

### 4.1 Charge Balance & Thermodynamic Carbonate Completion
Raw published `mg/L` values convert to `mol/m^3` (`c_k = conc_mg_L / MW_k`). Where `CO3^2-` is unreported (`red_sea_swro_*`) while `HCO3-` and `pH` are measured, `CO3^2-` is computed from `pK_2(T)` (`CO3^2- + H+ <=> HCO3-`); incomplete profiles missing `HCO3-` and `pH` (`hypersaline_swro_santoro_2024_ic`) are excluded from transport PDEs. Minimal monovalent `Cl-` or `Na+` adjustment closes inlet electroneutrality `sum z_k c_k = 0`.

### 4.2 Channel Conservation & Potential Closure
For each species `k` in channel `HC` or `LC`:
$$\nabla \cdot \mathbf{J}_k = 0, \qquad \mathbf{J}_k = c_k \mathbf{u} - D_k(T)\nabla c_k - \frac{z_k F}{RT} D_k(T) c_k \nabla \Phi$$
Eliminating electric current divergence via local electroneutrality (`sum_k z_k c_k = 0`) yields the variable-conductivity elliptic PDE for liquid-junction potential `Phi(x,y)`:
$$\nabla \cdot \left(\kappa \nabla \Phi\right) = -F \sum_{k=1}^{8} z_k \nabla \cdot \left(D_k \nabla c_k\right), \qquad \kappa(x,y) = \frac{F^2}{RT}\sum_{k=1}^{8} z_k^2 D_k c_k(x,y)$$
Zero normal total electric current (`dPhi/dy = 0`) is enforced implicitly along channel walls and outlets.

### 4.3 Multi-Ion Donnan Equilibrium & Constant-Field GHK Membrane Flux
At every axial station `x_i` on both CEM (`X_fix < 0`) and AEM (`X_fix > 0`) interfaces, internal membrane concentrations `c_k^m` satisfy exact Donnan equilibrium solved via safeguarded Newton–bisection for dimensionless potential `u_D = -F DeltaPhi_D / (RT)`:
$$\sum_{k=1}^{8} z_k c_k^{\text{sol}} \exp(z_k u_D) + X_{\text{fix}} = 0, \qquad c_k^m = c_k^{\text{sol}} \exp(z_k u_D)$$
Across each membrane thickness `delta_m`, constant-field 1D Nernst–Planck integration (Goldman–Hodgkin–Katz) gives species flux `J_k(dphi_m)` (`HC -> LC` positive):
$$\xi_k = \frac{z_k F \Delta \phi_m}{RT}, \qquad J_k = \frac{D_k^m}{\delta_m} \left[ B(-\xi_k) c_k^{m,H} - B(\xi_k) c_k^{m,L} \right], \qquad B(x) = \frac{x}{e^x - 1}$$
An exact damped Newton–bisection determines `Delta phi_m(x_i)` enforcing local net electric current density `F sum_k z_k J_k = I_op` (`I_op = 0` for OCV, `I_op = load_fraction * E_ocv / R_int` for loaded cells).

### 4.4 Robin Interface Linearization & Anderson Acceleration
To guarantee positivity and tight per-species mass conservation down to sub-millimolar trace species (`CO3^2-`), membrane fluxes are linearized continuously at wall solutions using the exact Donnan slope `exp(z_k u_D)`:
$$J_k^{\text{HC}} = J_k^* + s_k^{\text{HC}}\left(c_k^{\text{wall,HC}} - c_{k}^{\text{wall,HC},*}\right), \qquad s_k^{\text{HC}} = \frac{D_k^m}{\delta_m} B(-\xi_k) \exp(z_k u_D^{\text{HC}})$$
Fixed-point outer iterations couple HC species, LC species, electric potentials, Donnan-GHK fluxes, and `I_op` using Anderson Acceleration (`m_aa = 4`, damping `0.35`, per-species normalized residuals) with stagnation fallback.

---

## 5. Electrical & Hydraulic Performance

$$E_{\text{OCV}} = \frac{1}{L} \int_0^L \left( E_{\text{CEM}}(x) + E_{\text{AEM}}(x) \right) dx, \qquad R_{\text{int}} = R_{\text{HC}} + R_{\text{LC}} + R_{\text{CEM}} + R_{\text{AEM}}$$
$$P_{\text{gross,max}} = \frac{E_{\text{OCV}}^2}{4 R_{\text{int}}}, \qquad P_{\text{pump}} = \frac{\Delta p_{\text{HC}} \bar{u}_{\text{HC}} h}{\eta_{\text{pump}} L} + \frac{\Delta p_{\text{LC}} \bar{u}_{\text{LC}} h}{\eta_{\text{pump}} L}, \qquad P_{\text{net,max}} = P_{\text{gross,max}} - P_{\text{pump}}$$

---

## 6. USGS `pitzer.dat` High-Salinity Thermodynamics (`REDMind-Pitzer-HMW-v2.0`)

Molalities `m_i` (`mol / kg H2O`) are converted from `mol/m^3` using Laliberte-type brine density `rho(T, TDS)`. Following Harvie, Moller & Weare (1984) and Plummer et al. (1988), single-ion activity coefficients `gamma_i`, osmotic coefficient `phi`, and water activity `a_w` are evaluated with `A_phi(T)` (Bradley–Pitzer 1979) and all binary/ternary virial parameters (`beta^(0), beta^(1), beta^(2), C^phi, theta, psi, lambda`) from USGS PHREEQC `pitzer.dat`:
$$\ln a_w = -\phi M_w \sum_i m_i$$
Aqueous carbonate speciation (`CO2(aq) / HCO3- / CO3^2-`), `MgCO3(0)` ion-pair complexation, and `SO4^2- / HSO4-` partitioning are iterated self-consistently with Pitzer activity coefficients (`8` iterations). Mineral saturation metrics use one-way coupling:
$$\Omega_{\text{Calcite}} = \frac{\{\text{Ca}^{2+}\}\{\text{CO}_3^{2-}\}}{K_{\text{sp,Cal}}(T)}, \qquad \Omega_{\text{Gypsum}} = \frac{\{\text{Ca}^{2+}\}\{\text{SO}_4^{2-}\} a_w^2}{K_{\text{sp,Gyp}}}, \qquad \text{SI} = \log_{10} \Omega$$
Regimes: `Undersaturated` (`SI < -0.1`), `Near-equilibrium` (`-0.1 <= SI <= 0.1`), `Supersaturated` (`SI > 0.1`). Davies `SI` is also logged alongside `davies_validity_flag` (`I > 0.5 mol/kg`) to expose its breakdown in concentrated brines.

---

## 7. Classical Nucleation Theory (`REDMind-CNT-Santoro2021-v2.0`)

Following Santoro et al. (2021), for supersaturated states (`Omega > 1`):
$$\Delta \mu = k_B T \ln \Omega, \qquad r^* = \frac{2 \gamma_{sl} v_m}{\Delta \mu}, \qquad \Delta G^*_{\text{hom}} = \frac{16 \pi \gamma_{sl}^3 v_m^2}{3 \Delta \mu^2}$$
Membrane wetting and surface roughness `r` modify the barrier via the Wenzel spherical-cap geometric factor:
$$\cos \theta_{\text{eff}} = \text{clip}(r \cos \theta_0, -0.9999, 0.9999), \qquad f(\theta_{\text{eff}}) = \frac{(2 + \cos \theta_{\text{eff}})(1 - \cos \theta_{\text{eff}})^2}{4}$$
$$\Delta G^*_{\text{het}} = f(\theta_{\text{eff}}) \Delta G^*_{\text{hom}}, \qquad \text{Propensity} = \exp\left(-\frac{\Delta G^*_{\text{het}}}{k_B T}\right)$$
Categories:
- **Category A (`Clean membrane`):** `SI < -0.1`
- **Category B (`Scaling-risk condition`):** `SI >= -0.1` and `DeltaG*_het / (k_B T) > 40` (or `Omega <= 1`)
- **Category C (`Nucleation-prone condition`):** `Omega > 1` and `DeltaG*_het / (k_B T) <= 40`

*(Exploratory sensitivity scenarios evaluate hypothetical fixed membrane resistance increments `Delta_R_m in {+0.5, +1.5, +3.0, +6.0} Ohm*cm^2` applied symmetrically as `R_m,eff = R_m0 + 0.5 * Delta_R_m` and are explicitly isolated from validated physical fouling trajectories.)*
