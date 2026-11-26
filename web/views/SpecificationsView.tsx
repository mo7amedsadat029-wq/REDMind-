import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { EquationBlock } from '../components/EquationBlock';
import { MarkdownView } from '../components/MarkdownView';
import { ReferencesView } from './ReferencesView';

type SpecSection =
  | 'geometry_flow'
  | 'binary_pde'
  | 'multicomponent_np'
  | 'pitzer_cnt'
  | 'numerics_provenance'
  | 'references';

interface ProvenanceData {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export const SpecificationsView: React.FC = () => {
  const [section, setSection] = useState<SpecSection>('geometry_flow');
  const [provenance, setProvenance] = useState<ProvenanceData | null>(null);
  const [provSearch, setProvSearch] = useState('');
  const [fullDocMd, setFullDocMd] = useState<string | null>(null);
  const [showFullDoc, setShowFullDoc] = useState(false);

  useEffect(() => {
    fetch('/api/materials')
      .then((r) => r.json())
      .then((d) => setProvenance(d.parameterProvenance ?? null));
    fetch('/api/materials/file?path=MODEL_SPECIFICATION.md')
      .then((r) => r.json())
      .then((d) => setFullDocMd(d.content ?? null));
  }, []);

  const filteredProv = useMemo(() => {
    if (!provenance) return [];
    const q = provSearch.trim().toLowerCase();
    if (!q) return provenance.rows;
    return provenance.rows.filter((r) =>
      Object.values(r).some((v) => v.toLowerCase().includes(q))
    );
  }, [provenance, provSearch]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1C2536] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">
            Model Specification, Governing Equations &amp; Discretization
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            Complete mathematical specification of REDMind v2.1.0: 2D periodic cell-pair geometry, analytical Poiseuille hydrodynamics, repaired binary NaCl PDE, 8-ion Nernst–Planck + Donnan–GHK transport, USGS Pitzer HMW thermodynamics, Santoro (2021) heterogeneous CNT nucleation, and numerical methods.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowFullDoc(!showFullDoc)}
          className="px-3.5 py-2 text-xs font-medium rounded border border-[#2C3A52] bg-[#0E131D] hover:bg-[#131A27] text-slate-200 whitespace-nowrap shrink-0"
        >
          {showFullDoc ? 'Return to Equation Sheets' : 'View Full MODEL_SPECIFICATION.md'}
        </button>
      </div>

      {showFullDoc && fullDocMd ? (
        <div className="border border-[#1C2536] bg-[#0E131D] rounded p-6">
          <MarkdownView content={fullDocMd} />
        </div>
      ) : (
        <>
          {/* Interactive Cell-Pair Domain & Boundary Coordinate Schematic */}
          <div className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden">
            <div className="px-4 py-2.5 bg-[#131A27] border-b border-[#1C2536] flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-200">
                Periodic 2D Reverse Electrodialysis Cell-Pair Domain &amp; Boundary Sign Convention (v2.0.0 Repaired)
              </span>
              <span className="text-xs font-mono text-cyan-400">
                x ∈ [0, L=0.10 m] · y_dil ∈ [0, H] · y_conc ∈ [H, 2H] (H = 270 μm)
              </span>
            </div>
            <div className="p-4 bg-[#080B11] overflow-x-auto">
              <svg
                viewBox="0 0 900 220"
                className="w-full max-w-[900px] mx-auto h-auto text-slate-200"
                role="img"
                aria-label="2D RED cell-pair coordinate system and ion fluxes"
              >
                {/* AEM Top */}
                <rect x="110" y="18" width="660" height="16" fill="#131A27" stroke="#334155" />
                <text x="440" y="29" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono, monospace">
                  AEM INTERFACE (y = 2H = 540 μm · Fixed X_aem = +2000 mol/m³ · Co-ions excluded, Cl⁻ / SO₄²⁻ permeate)
                </text>

                {/* Concentrated Channel */}
                <rect x="110" y="34" width="660" height="68" fill="#0E2235" stroke="#1C2536" />
                <text x="130" y="54" fill="#22D3EE" fontSize="11" fontWeight="600" fontFamily="IBM Plex Sans, sans-serif">
                  Concentrated Channel (HC) — c_conc(x, y)
                </text>
                <text x="130" y="72" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono, monospace">
                  y_local = 0 at CEM (j = 0) · Boundary Depletion (-J_cem) · u(y) = 6 U_mean (y/H)(1 - y/H)
                </text>
                <path d="M 135 84 L 220 84" stroke="#22D3EE" strokeWidth="1.5" markerEnd="url(#arrowCyan)" />
                <text x="230" y="88" fill="#64748B" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  Poiseuille Flow →
                </text>

                {/* CEM Center Membrane */}
                <rect x="110" y="102" width="660" height="22" fill="#182032" stroke="#22D3EE" strokeOpacity="0.55" />
                <text x="440" y="116" textAnchor="middle" fill="#E2E8F0" fontSize="10" fontWeight="600" fontFamily="JetBrains Mono, monospace">
                  CEM INTERFACE (y = H = 270 μm · Fixed X_cem = -2000 mol/m³ · δ_cem = 125 μm · Wall SI_Pitzer &amp; CNT Evaluated Here)
                </text>

                {/* Flux arrows across CEM showing v2.0.0 repaired sign */}
                <line x1="360" y1="88" x2="360" y2="142" stroke="#34D399" strokeWidth="1.8" />
                <polygon points="356,138 364,138 360,145" fill="#34D399" />
                <text x="370" y="138" fill="#34D399" fontSize="10" fontFamily="JetBrains Mono, monospace">
                  +J_cem (Na⁺, Ca²⁺ leaves HC → enters LC · -J_cem at HC y=0 wall)
                </text>

                {/* Dilute Channel */}
                <rect x="110" y="124" width="660" height="68" fill="#0B131E" stroke="#1C2536" />
                <text x="130" y="156" fill="#F59E0B" fontSize="11" fontWeight="600" fontFamily="IBM Plex Sans, sans-serif">
                  Dilute Channel (LC) — c_dil(x, y)
                </text>
                <text x="130" y="174" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono, monospace">
                  y_local = H at CEM (j = ny-1) · Boundary Enrichment (+J_cem) · Outlet ∂c/∂x = 0
                </text>

                {/* AEM Bottom periodic wrap */}
                <rect x="110" y="192" width="660" height="14" fill="#131A27" stroke="#334155" />
                <text x="440" y="202" textAnchor="middle" fill="#64748B" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  PERIODIC AEM LOWER BOUNDARY (y = 0 μm · Receives +J_aem from HC top y = 2H)
                </text>

                {/* Inlet / Outlet Labels */}
                <text x="98" y="70" textAnchor="end" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono, monospace">
                  Inlet
                </text>
                <text x="98" y="83" textAnchor="end" fill="#64748B" fontSize="9" fontFamily="JetBrains Mono, monospace">
                  x = 0
                </text>
                <text x="782" y="70" textAnchor="start" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono, monospace">
                  Outlet
                </text>
                <text x="782" y="83" textAnchor="start" fill="#64748B" fontSize="9" fontFamily="JetBrains Mono, monospace">
                  x = L
                </text>

                <defs>
                  <marker id="arrowCyan" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#22D3EE" />
                  </marker>
                </defs>
              </svg>
            </div>
          </div>

          {/* Section Navigation */}
          <div className="flex flex-wrap gap-1 border-b border-[#1C2536]">
            {(
              [
                ['geometry_flow', '1. Hydrodynamics & Temp. Scaling'],
                ['binary_pde', '2. Binary NaCl PDE & v2.0 BC Fix'],
                ['multicomponent_np', '3. 8-Ion Nernst–Planck & GHK'],
                ['pitzer_cnt', '4. USGS Pitzer & Santoro CNT'],
                ['numerics_provenance', '5. Numerics & 42-Param Provenance'],
                ['references', '6. Literature References (16)'],
              ] as Array<[SpecSection, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  section === id
                    ? 'border-cyan-400 text-cyan-300 bg-[#0E131D]'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Section 1: Geometry & Flow */}
          {section === 'geometry_flow' && (
            <div className="space-y-4">
              <EquationBlock
                eqNumber="Eq. (1.1)"
                title="Analytical Plane Poiseuille Velocity & Pressure Gradient"
                codeSymbol="src/flow_solver.py · analytical_poiseuille_2d"
                latex="u(y) = -\frac{1}{2\mu_{\text{eff}}}\frac{dp}{dx}\,y(H - y) = 6\,U_{\text{mean}}\frac{y}{H}\left(1 - \frac{y}{H}\right), \qquad \Delta p = -\frac{dp}{dx}\,L = \frac{12\,\mu_{\text{eff}}\,U_{\text{mean}}\,L}{H^2}"
                description="Both the concentrated and dilute channels assume steady, incompressible, fully developed 2D laminar channel flow between spacer-free parallel plates with strict no-slip conditions u(0) = u(H) = 0 and Re = ρ U_mean D_h / μ_eff << 2300."
                variables={[
                  { symbol: 'H', meaning: 'Channel height (baseline 270 μm)', units: 'm' },
                  { symbol: 'L', meaning: 'Channel length (baseline 0.10 m)', units: 'm' },
                  { symbol: 'D_h', meaning: 'Hydraulic diameter (2H)', units: 'm' },
                  { symbol: 'U_{\\text{mean}}', meaning: 'Channel-averaged velocity', units: 'm/s' },
                  { symbol: '\\mu_{\\text{eff}}', meaning: 'Dynamic viscosity at temperature T', units: 'Pa·s' },
                  { symbol: '\\Delta p', meaning: 'Channel pressure drop (146.50 Pa @ 1 cm/s)', units: 'Pa' },
                ]}
              />

              <EquationBlock
                eqNumber="Eq. (1.2)"
                title="Vogel Water Viscosity & Stokes–Einstein Diffusivity Scaling"
                codeSymbol="src/multicomponent_transport.py · stokes_einstein_diffusivities"
                latex="\mu_{\text{eff}}(T) = \mu_{25^\circ\text{C}} \exp\!\left[578.919\left(\frac{1}{T - 137.546} - \frac{1}{298.15 - 137.546}\right)\right], \qquad D_k(T) = D_{k,25^\circ\text{C}}\left(\frac{T}{298.15}\right)\left(\frac{\mu_{25^\circ\text{C}}}{\mu_{\text{eff}}(T)}\right)"
                description="Temperature dependence is physically coupled to both hydrodynamic friction and aqueous ion mobility across 283.15 K – 318.15 K."
                variables={[
                  { symbol: '\\mu_{25^\\circ\\text{C}}', meaning: 'Reference water viscosity', units: '8.9×10⁻⁴ Pa·s' },
                  { symbol: 'T', meaning: 'Absolute temperature', units: 'K' },
                  { symbol: 'D_{k,25^\\circ\\text{C}}', meaning: 'USGS pitzer.dat tracer diffusivity', units: 'm²/s' },
                ]}
              />

              <EquationBlock
                eqNumber="Eq. (1.3)"
                title="Hydrodynamic Pumping Power Loss per Cell Pair"
                codeSymbol="src/electrical.py · compute_electrical_performance"
                latex="P_{\text{pump}} = \frac{\Delta p_{\text{conc}}\,U_{\text{mean,conc}}\,H_{\text{conc}} + \Delta p_{\text{dil}}\,U_{\text{mean,dil}}\,H_{\text{dil}}}{\eta_{\text{pump}}\,L}, \qquad P_{\text{net}} = P_{\text{gross}} - P_{\text{pump}}"
                variables={[
                  { symbol: '\\eta_{\\text{pump}}', meaning: 'Pump mechanical efficiency (0.75)', units: '—' },
                  { symbol: 'P_{\\text{gross}}', meaning: 'Maximum cell-pair gross power density', units: 'W/m²' },
                  { symbol: 'P_{\\text{net}}', meaning: 'Net harvestable electrical power density', units: 'W/m²' },
                ]}
              />
            </div>
          )}

          {/* Section 2: Binary NaCl PDE & v2.0 BC Repair */}
          {section === 'binary_pde' && (
            <div className="space-y-4">
              <EquationBlock
                eqNumber="Eq. (2.1)"
                title="2D Steady Binary NaCl Advection–Diffusion Conservation"
                codeSymbol="src/transport_solver.py · solve_advection_diffusion_2d"
                latex="u(y)\frac{\partial c}{\partial x} = D_{\text{eff}}\left(\frac{\partial^2 c}{\partial x^2} + \frac{\partial^2 c}{\partial y^2}\right), \qquad D_{\text{eff}} = \frac{2\,D_{\text{Na}^+}\,D_{\text{Cl}^-}}{D_{\text{Na}^+} + D_{\text{Cl}^-}}"
                description="Ambipolar salt diffusivity governs binary NaCl concentration c(x, y) in both channels under local electroneutrality."
                variables={[
                  { symbol: 'D_{\\text{Na}^+}', meaning: 'Na⁺ aqueous diffusivity (25 °C)', units: '1.334×10⁻⁹ m²/s' },
                  { symbol: 'D_{\\text{Cl}^-}', meaning: 'Cl⁻ aqueous diffusivity (25 °C)', units: '2.032×10⁻⁹ m²/s' },
                  { symbol: 'D_{\\text{eff}}', meaning: 'Ambipolar NaCl diffusivity (25 °C)', units: '1.610×10⁻⁹ m²/s' },
                ]}
              />

              <EquationBlock
                eqNumber="Eq. (2.2)"
                title="Repaired v2.0.0 CEM & AEM Wall Neumann Flux Boundary Conditions"
                codeSymbol="src/transport_solver.py · run_simulation"
                highlight="amber"
                latex="\text{Conc. Channel:} \quad \left.\frac{\partial c_{\text{conc}}}{\partial y}\right|_{y=0\text{ (CEM)}} = +\frac{J_{\text{CEM}}(x)}{D_{\text{eff}}} \;\; (\text{salt exits}, -J_{\text{CEM}}), \qquad \left.\frac{\partial c_{\text{conc}}}{\partial y}\right|_{y=H\text{ (AEM)}} = -\frac{J_{\text{AEM}}(x)}{D_{\text{eff}}} \;\; (\text{salt exits}, -J_{\text{AEM}})"
                description="Critical v1.0.0 → v2.0.0 repair: v1.0.0 erroneously supplied +J_CEM instead of -J_CEM at the concentrated bottom CEM wall (y=0), violating channel mass balance by up to 1.10% and producing nonphysical salt enrichment in the HC CEM boundary layer. Switching to -J_CEM restores 0.006% conservation accuracy."
                variables={[
                  { symbol: 'J_{\\text{CEM}}', meaning: 'Salt molar flux HC → LC across CEM (>0)', units: 'mol/(m²·s)' },
                  { symbol: 'J_{\\text{AEM}}', meaning: 'Salt molar flux HC → LC across AEM (>0)', units: 'mol/(m²·s)' },
                ]}
              />

              <EquationBlock
                eqNumber="Eq. (2.3)"
                title="1:1 Donnan Equilibrium, Membrane Salt Flux & Loaded Electromigration"
                codeSymbol="src/donnan.py · donnan_equilibrium_1to1 / membrane_salt_flux"
                latex="\alpha = \frac{|X_{\text{fix}}|}{|X_{\text{fix}}| + 2\,c_{\text{co}}^m}, \qquad J_{\text{mem}} = \frac{D_{\text{mem,eff}}}{\delta_m}\left(c_{\text{co}}^{m,H} - c_{\text{co}}^{m,L}\right) + \left(t_{\text{counter}}^{\text{mem}} - t_{\text{counter}}^{\text{sol}}\right)\frac{I_{\text{op}}}{F}"
                variables={[
                  { symbol: 'X_{\\text{fix}}', meaning: 'Fixed charge (±2000 mol/m³)', units: 'mol/m³' },
                  { symbol: '\\alpha', meaning: 'Apparent Donnan permselectivity', units: '—' },
                  { symbol: 'I_{\\text{op}}', meaning: 'Operating current density', units: 'A/m²' },
                ]}
              />

              <EquationBlock
                eqNumber="Eq. (2.4)"
                title="Cell-Pair Open-Circuit EMF & Internal Area Resistance"
                codeSymbol="src/electrical.py · compute_electrical_performance"
                latex="E_{\text{OCV}} = (\alpha_{\text{CEM}} + \alpha_{\text{AEM}})\frac{RT}{F}\ln\!\left(\frac{\bar{c}_{\text{conc}}}{\bar{c}_{\text{dil}}}\right), \qquad R_{\text{int}} = \frac{H_{\text{c}}}{\bar{\kappa}_{\text{c}}} + \frac{H_{\text{d}}}{\bar{\kappa}_{\text{d}}} + \frac{\delta_{\text{CEM}}}{\sigma_{\text{CEM}}} + \frac{\delta_{\text{AEM}}}{\sigma_{\text{AEM}}} + \Delta R_m"
                description="ΔR_m is zero in all physical baselines and applied solely as a hypothetical parametric sensitivity term in ms_sens_001..008 and the interactive slider."
              />
            </div>
          )}

          {/* Section 3: 8-Ion Multicomponent Nernst-Planck */}
          {section === 'multicomponent_np' && (
            <div className="space-y-4">
              <EquationBlock
                eqNumber="Eq. (3.1)"
                title="2D Nernst–Planck Ion Conservation (8 Major Desalination Species)"
                codeSymbol="src/multicomponent_transport.py · _solve_species_2d_np"
                highlight="cyan"
                latex="\nabla \cdot \mathbf{J}_k = 0, \qquad \mathbf{J}_k = \mathbf{u}\,c_k - D_k \nabla c_k - \frac{z_k\,D_k\,F}{RT}\,c_k \nabla \phi \qquad k \in \{\text{Na}^+, \text{K}^+, \text{Mg}^{2+}, \text{Ca}^{2+}, \text{SO}_4^{2-}, \text{HCO}_3^-, \text{CO}_3^{2-}\}"
                description="Cl⁻ is eliminated via exact local electroneutrality c_Cl = ∑_{k≠Cl} z_k c_k, ensuring zero charge-balance drift everywhere in the 2D computational mesh."
                variables={[
                  { symbol: 'c_k', meaning: 'Molar ion concentration of species k', units: 'mol/m³' },
                  { symbol: 'z_k', meaning: 'Ion valence (+1, +2, -1, -2)', units: '—' },
                  { symbol: '\\phi', meaning: 'Local liquid-junction electric potential', units: 'V' },
                ]}
              />

              <EquationBlock
                eqNumber="Eq. (3.2)"
                title="Elliptic Current-Conservation Potential PDE"
                codeSymbol="src/multicomponent_transport.py · _solve_channel_potential"
                latex="\nabla \cdot \left(-\kappa \nabla \phi - F\sum_k z_k D_k \nabla c_k\right) = 0, \qquad \kappa = \frac{F^2}{RT}\sum_k z_k^2\,D_k\,c_k"
                description="Conserves electric charge density ∇·i = 0 across channel interiors while enforcing transmembrane ionic current I_mem = F ∑ z_k J_k at the CEM and AEM walls."
                variables={[
                  { symbol: '\\kappa', meaning: 'Local ionic conductivity field', units: 'S/m' },
                  { symbol: 'i_{\\text{wall}}', meaning: 'Normal current density at CEM/AEM', units: 'A/m²' },
                ]}
              />

              <EquationBlock
                eqNumber="Eq. (3.3)"
                title="Multi-Ion Donnan Equilibrium & Goldman–Hodgkin–Katz (GHK) Membrane Flux"
                codeSymbol="src/multicomponent_transport.py · multi_ion_membrane_flux_batch"
                latex="\sum_{k=1}^{8} z_k\,c_k^{\text{sol}}\exp(z_k u_D) + X_{\text{fix}} = 0 \;\;\Big(u_D = -\frac{F\Delta\phi_D}{RT}\Big), \qquad J_k^{\text{mem}} = \frac{D_k^{\text{mem}}}{\delta_m}\,\frac{\xi_k}{e^{\xi_k}-1}\left(c_k^{m,H} e^{\xi_k} - c_k^{m,L}\right)"
                description="Solved at every axial membrane node using bracketed Newton-bisection for u_D and intra-membrane potential drop Δφ_m (with ξ_k = z_k F Δφ_m / RT) to satisfy F ∑ z_k J_k = I_op, stabilized in the channel PDEs by exact Robin wall slopes s_H, s_L and Anderson Acceleration (DIIS, m = 4)."
                variables={[
                  { symbol: 'D_k^{\\text{mem}}', meaning: 'Scaled membrane diffusivity (0.08/0.025 counter; 8e-4/2.5e-4 co)', units: 'm²/s' },
                  { symbol: '\\xi_k', meaning: 'Dimensionless membrane drift parameter', units: '—' },
                ]}
              />
            </div>
          )}

          {/* Section 4: Pitzer HMW & Santoro CNT */}
          {section === 'pitzer_cnt' && (
            <div className="space-y-4">
              <EquationBlock
                eqNumber="Eq. (4.1)"
                title="Harvie–Møller–Weare (HMW) Pitzer Activity Coefficient Model (USGS pitzer.dat)"
                codeSymbol="src/pitzer_model.py · compute_pitzer_activities"
                latex="\ln \gamma_M = z_M^2 f^\gamma + \sum_a m_a \!\left(2 B_{Ma} + Z C_{Ma}\right) + \sum_{c'} m_{c'} \!\left(2\Phi_{Mc'} + \sum_a m_a \Psi_{Mc'a}\right) + \sum_{a<a'} m_a m_{a'} \Psi_{Maa'} + |z_M| \sum_c \sum_a m_c m_a C_{ca}"
                description="Overcomes the classic Davies equation breakdown above I > 0.5 mol/kg, accurately capturing CaSO₄·2H₂O salting-in in concentrated NaCl brines (I up to 3.4 mol/kg) and carbonate/MgCO₃⁰ ion pairing."
                variables={[
                  { symbol: 'm_k', meaning: 'Density-corrected molal concentration', units: 'mol/kg H₂O' },
                  { symbol: 'B_{Ma}, C_{Ma}', meaning: 'Temperature-dependent binary Pitzer parameters', units: 'kg/mol' },
                  { symbol: '\\Phi_{ij}, \\Psi_{ijk}', meaning: 'Asymmetric mixing & triple-ion interactions', units: '—' },
                ]}
              />

              <EquationBlock
                eqNumber="Eq. (4.2)"
                title="Calcite & Gypsum Wall Saturation Index (One-Way Coupled Post-Processing)"
                codeSymbol="src/pitzer_model.py · evaluate_mineral_saturation_pitzer"
                latex="\Omega_{\text{cal}} = \frac{a_{\text{Ca}^{2+}}\,a_{\text{CO}_3^{2-}}}{K_{\text{sp,calcite}}(T)}, \qquad \Omega_{\text{gyp}} = \frac{a_{\text{Ca}^{2+}}\,a_{\text{SO}_4^{2-}}\,a_w^2}{K_{\text{sp,gypsum}}(T)}, \qquad \mathrm{SI} = \log_{10}(\Omega)"
                description="Evaluated directly at the solved CEM membrane wall concentration c_wall(x). SI > 0 marks thermodynamic supersaturation (Category B), not deposition rate or crystal growth thickness."
              />

              <EquationBlock
                eqNumber="Eq. (4.3)"
                title="Santoro et al. (2021) Heterogeneous Classical Nucleation Theory (Wenzel Wetting)"
                codeSymbol="src/nucleation_model.py · evaluate_heterogeneous_nucleation"
                latex="r^* = \frac{2\,\gamma_{\text{sl}}\,v_m}{k_B T \ln\Omega}, \qquad f(\theta_{\text{eff}}) = \frac{(2 + \cos\theta_{\text{eff}})(1 - \cos\theta_{\text{eff}})^2}{4}, \qquad \frac{\Delta G^*_{\text{het}}}{k_B T} = f(\theta_{\text{eff}})\,\frac{16\pi\,\gamma_{\text{sl}}^3\,v_m^2}{3\,(k_B T)^3 (\ln\Omega)^2}"
                description="Classifies supersaturated CEM/AEM states into Category A (Clean, SI < -0.1), Category B (Scaling-risk, ΔG*_het / k_B T > 40), or Category C (Nucleation-prone, ΔG*_het / k_B T ≤ 40). Category D is never assigned."
                variables={[
                  { symbol: '\\gamma_{\\text{sl}}', meaning: 'Calcite 0.094 J/m² · Gypsum 0.037 J/m²', units: 'J/m²' },
                  { symbol: '\\theta_{\\text{eff}}', meaning: 'Wenzel angle arccos(r cos θ_Y)', units: 'deg' },
                  { symbol: 'v_m', meaning: 'Molecular volume V_m / N_A', units: 'm³' },
                ]}
              />
            </div>
          )}

          {/* Section 5: Discretization & 42-Parameter Provenance */}
          {section === 'numerics_provenance' && (
            <div className="space-y-5">
              <EquationBlock
                eqNumber="Eq. (5.1)"
                title="Conservative Scharfetter–Gummel Electro-Migration Flux & Banded Direct Elimination"
                codeSymbol="src/multicomponent_transport.py · _bernoulli_arr / lib/redSolver2d.ts · solveBandedSystem"
                latex="J_{k, i+1/2} = \frac{D_k}{\Delta x}\Big[B(\mathrm{Pe}_{x})\,c_{i,j} - B(-\mathrm{Pe}_{x})\,c_{i+1,j}\Big] + \max(u,0)c_{i,j} + \min(u,0)c_{i+1,j}, \qquad B(x) = \frac{x}{e^x - 1}"
                description="Guarantees M-matrix positivity without spurious oscillations at high transmembrane potential gradients. Linear systems are solved exactly using sparse CSR LU (Python) / exact banded Gaussian elimination with partial pivoting (Web TypeScript live engine, full 2·ny upper fill-in band)."
              />

              {/* Searchable 42-Parameter Provenance Ledger */}
              <div className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden">
                <div className="px-4 py-3 bg-[#131A27] border-b border-[#1C2536] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      Complete Parameter Provenance Ledger ({filteredProv.length} Parameters)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Source: <span className="font-mono">reports/parameter_provenance.csv</span> — every constant linked to literature source and codebase symbol.
                    </p>
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={provSearch}
                      onChange={(e) => setProvSearch(e.target.value)}
                      placeholder="Filter parameter or citation..."
                      className="bg-[#080B11] border border-[#2C3A52] rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                {provenance && (
                  <div className="overflow-x-auto max-h-[520px]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-[#080B11] sticky top-0 border-b border-[#1C2536] text-slate-300">
                        <tr>
                          {provenance.headers.map((h) => (
                            <th key={h} className="py-2.5 px-3 font-semibold whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1C2536]/80 font-mono tabular-nums">
                        {filteredProv.map((row, idx) => (
                          <tr key={idx} className="hover:bg-[#131A27]/60">
                            {provenance.headers.map((h) => (
                              <td
                                key={h}
                                className={`py-2 px-3 align-top ${
                                  h === 'parameter'
                                    ? 'text-cyan-300 font-semibold whitespace-nowrap'
                                    : h === 'citation'
                                      ? 'text-slate-300 font-sans min-w-[200px]'
                                      : 'text-slate-300'
                                }`}
                              >
                                {row[h] || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 6: Literature References & Extracted Components */}
          {section === 'references' && <ReferencesView />}
        </>
      )}
    </div>
  );
};
