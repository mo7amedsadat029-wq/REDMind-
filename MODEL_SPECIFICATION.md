# REDMind Model Specification Document

## 1. Domain and Coordinate System

The reference simulator models a two-dimensional unit cell pair of an industrial/laboratory Reverse Electrodialysis (RED) stack in Cartesian coordinates $(x, y)$:
- $x \in [0, L]$: Streamwise direction parallel to the membrane surfaces ($L = 0.10\text{ m}$).
- $y \in [0, h]$: Transverse direction perpendicular to the membrane surfaces for each channel ($h = 270\text{ }\mu\text{m}$).
- Bottom channel ($y_{\text{global}} \in [0, h]$): Low Concentration (LC, Dilute / River water channel).
- Top channel ($y_{\text{global}} \in [h, 2h]$): High Concentration (HC, Concentrated / Seawater channel).
- Separating membrane at $y_{\text{global}} = h$: Cation Exchange Membrane (CEM).
- Outer boundaries at $y_{\text{global}} = 0$ and $y_{\text{global}} = 2h$: Anion Exchange Membranes (AEM).

```
y = 2h ──────────────────────── AEM (outer boundary) ────────────────────────
       Concentrated Channel (HC): u_HC(y), c_HC(x,y), p_HC(x)
y = h  ──────────────────────── CEM (central interface) ──────────────────────
       Dilute Channel (LC):       u_LC(y), c_LC(x,y), p_LC(x)
y = 0  ──────────────────────── AEM (outer boundary) ────────────────────────
       x = 0 (Inlet)                                         x = L (Outlet)
```

---

## 2. Physical Assumptions

1. **Fluid Flow:** Steady-state, laminar, incompressible, Newtonian fluid with constant density $\rho = 997\text{ kg/m}^3$ and dynamic viscosity $\mu = 8.90 \times 10^{-4}\text{ Pa}\cdot\text{s}$.
2. **Channel Hydrodynamics:** Fully developed plane Poiseuille flow in each channel. Hydrodynamic entrance lengths ($L_h \approx 0.05 \cdot \text{Re} \cdot D_h < 0.2\text{ mm}$) are negligible compared to channel length ($L = 100\text{ mm}$).
3. **Membrane Impermeability to Water:** Electro-osmotic and osmotic water transport across the membrane are neglected in this baseline 2D benchmark ($v_y = 0$).
4. **Electrolyte Solution:** Binary 1:1 electrolyte ($\text{NaCl} \to \text{Na}^+ + \text{Cl}^-$).
5. **Local Electroneutrality:** In both fluid channels, $c_{\text{Na}^+} = c_{\text{Cl}^-} = c$. Poisson's equation for electrostatic charge density is replaced by the electroneutrality closure.
6. **Ion Transport:** Steady-state Nernst–Planck advection-diffusion-migration. Electroneutrality eliminates the internal electric potential gradient from the bulk salt transport equation, reducing it to an effective advection-diffusion equation with ambipolar diffusivity:
   $$D_{\text{eff}} = \frac{2 D_{\text{Na}^+} D_{\text{Cl}^-}}{D_{\text{Na}^+} + D_{\text{Cl}^-}} \approx 1.611 \times 10^{-9}\text{ m}^2/\text{s}$$
7. **Membrane Interface:** Described by Donnan equilibrium partition conditions and 1D trans-membrane flux coupling based on counter-ion/co-ion diffusion.
8. **Temperature:** Isothermal operation at $T = 298.15\text{ K}$ ($25^\circ\text{C}$).

---

## 3. Governing Equations

### 3.1 Fluid Mechanics (Poiseuille Flow Benchmark)
For channel height $h$ with no-slip walls at $y=0$ and $y=h$:
$$u(y) = 6 \bar{u} \frac{y(h - y)}{h^2} = \frac{3}{2} \bar{u} \left[ 1 - \left(\frac{2y}{h} - 1\right)^2 \right]$$
$$v(x, y) = 0$$
$$\frac{dp}{dx} = -\frac{12 \mu \bar{u}}{h^2} = \text{const}$$
$$\Delta p = \frac{12 \mu \bar{u} L}{h^2}$$
$$\text{Re} = \frac{\rho \bar{u} D_h}{\mu}, \quad D_h = 2h$$

### 3.2 Ion Transport in Solution Channels
$$u(y) \frac{\partial c}{\partial x} = D_{\text{eff}} \left( \frac{\partial^2 c}{\partial x^2} + \frac{\partial^2 c}{\partial y^2} \right)$$
- Na⁺ and Cl⁻ concentrations:
  $$c_{\text{Na}^+}(x, y) = c(x, y), \quad c_{\text{Cl}^-}(x, y) = c(x, y)$$
- Liquid junction / diffusion potential:
  $$\nabla \Phi = -\frac{RT}{F} \left(\frac{D_{\text{Na}^+} - D_{\text{Cl}^-}}{D_{\text{Na}^+} + D_{\text{Cl}^-}}\right) \frac{\nabla c}{c}$$
  $$\Phi(x, y) - \Phi_{\text{ref}} = -\frac{RT}{F} t_{\text{diff}} \ln\left(\frac{c(x, y)}{c_{\text{ref}}}\right), \quad t_{\text{diff}} = \frac{D_{\text{Na}^+} - D_{\text{Cl}^-}}{D_{\text{Na}^+} + D_{\text{Cl}^-}} \approx -0.2074$$

### 3.3 Membrane Interfaces and Donnan Equilibrium
At the membrane-solution interface, electroneutrality inside the membrane:
$$z_{\text{ct}} c_{\text{ct}}^m + z_{\text{co}} c_{\text{co}}^m + z_{\text{fix}} X_{\text{fix}} = 0$$
Donnan partitioning:
$$c_{\text{ct}}^m c_{\text{co}}^m = c_{\text{sol}}^2$$
Yields analytical concentrations inside the membrane:
$$c_{\text{co}}^m = -\frac{|X_{\text{fix}}|}{2} + \sqrt{\left(\frac{X_{\text{fix}}}{2}\right)^2 + c_{\text{sol}}^2}$$
$$c_{\text{ct}}^m = |X_{\text{fix}}| + c_{\text{co}}^m$$
Local Donnan potential jump:
$$\Delta \Phi_{\text{Donnan}} = -\frac{RT}{F} \ln\left(\frac{c_{\text{Na}}^m}{c_{\text{Na}}^{\text{sol}}}\right)$$
Local permselectivity:
$$\alpha(c_{\text{sol}}) = \frac{|X_{\text{fix}}|}{|X_{\text{fix}}| + 2 c_{\text{co}}^m}$$

Trans-membrane salt flux $J_{\text{salt}}$ between concentrated side ($c_H$) and dilute side ($c_L$):
$$J_{\text{salt}} = \frac{D_{\text{eff}}^m}{\delta_m} \left( c_{\text{co}}^m(c_H) - c_{\text{co}}^m(c_L) \right)$$
where $D_{\text{eff}}^m = \frac{2 D_{\text{ct}}^m D_{\text{co}}^m}{D_{\text{ct}}^m + D_{\text{co}}^m}$ is the effective salt diffusivity in the membrane matrix.

### 3.4 Coupling and Boundary Conditions
- **Inlets ($x = 0$):**
  $$c_{\text{HC}}(0, y) = c_{\text{HC,inlet}}, \quad c_{\text{LC}}(0, y) = c_{\text{LC,inlet}}$$
- **Outlets ($x = L$):**
  $$\frac{\partial c_{\text{HC}}}{\partial x}(L, y) = 0, \quad \frac{\partial c_{\text{LC}}}{\partial x}(L, y) = 0$$
- **Membrane Walls (Neumann Flux):**
  - Concentrated channel bottom wall ($y=0$, CEM): $-D_{\text{eff}} \left.\frac{\partial c_{\text{HC}}}{\partial y}\right|_{y=0} = -J_{\text{CEM}}$
  - Concentrated channel top wall ($y=h$, AEM): $D_{\text{eff}} \left.\frac{\partial c_{\text{HC}}}{\partial y}\right|_{y=h} = -J_{\text{AEM}}$
  - Dilute channel top wall ($y=h$, CEM): $D_{\text{eff}} \left.\frac{\partial c_{\text{LC}}}{\partial y}\right|_{y=h} = J_{\text{CEM}}$
  - Dilute channel bottom wall ($y=0$, AEM): $-D_{\text{eff}} \left.\frac{\partial c_{\text{LC}}}{\partial y}\right|_{y=0} = J_{\text{AEM}}$

### 3.5 Electrical and Hydraulic Performance
$$E_{\text{OCV}} = (\bar{\alpha}_{\text{CEM}} + \bar{\alpha}_{\text{AEM}}) \frac{RT}{F} \ln\left(\frac{\bar{c}_{\text{HC}}}{\bar{c}_{\text{LC}}}\right)$$
$$R_{\text{int}} = \frac{h}{\bar{\sigma}_{\text{HC}}} + \frac{h}{\bar{\sigma}_{\text{LC}}} + \frac{\delta_{\text{CEM}}}{\sigma_{\text{CEM}}} + \frac{\delta_{\text{AEM}}}{\sigma_{\text{AEM}}}$$
$$P_{\text{gross,max}} = \frac{E_{\text{OCV}}^2}{4 R_{\text{int}}}$$
$$P_{\text{pump}} = \frac{\Delta p_{\text{HC}} \bar{u}_{\text{HC}} h}{\eta_{\text{pump}} L} + \frac{\Delta p_{\text{LC}} \bar{u}_{\text{LC}} h}{\eta_{\text{pump}} L}$$
$$P_{\text{net}} = P_{\text{gross,max}} - P_{\text{pump}}$$

---

## 4. Numerical Discretization and Convergence

- **Spatial Discretization:** Finite Difference Method on structured grid $(n_x \times n_y)$.
  - Advection: 1st-order upwind scheme (strictly bounded, preserves positivity $c > 0$).
  - Diffusion: 2nd-order central differences.
- **Linear Solver:** Compressed Sparse Row (CSR) matrix representation solved via SciPy SuperLU direct sparse solver (`scipy.sparse.linalg.spsolve`).
- **Coupling Iterations:** Picard fixed-point iteration with successive under-relaxation ($\omega = 0.30$):
  $$c^{(k+1)} = \omega \tilde{c} + (1 - \omega) c^{(k)}$$
- **Convergence Criterion:**
  $$\max\left( \frac{\|c_{\text{HC}}^{(k+1)} - c_{\text{HC}}^{(k)}\|_\infty}{c_{\text{HC,inlet}}}, \frac{\|c_{\text{LC}}^{(k+1)} - c_{\text{LC}}^{(k)}\|_\infty}{c_{\text{LC,inlet}}} \right) < 1.0 \times 10^{-4}$$
