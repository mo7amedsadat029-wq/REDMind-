import React, { useMemo, useState } from 'react';
import { BookMarked, ExternalLink, Search } from 'lucide-react';

type RefDomain =
  | 'all'
  | 'transport'
  | 'thermodynamics'
  | 'scaling_cnt'
  | 'brines'
  | 'boundaries';

interface ReferenceEntry {
  id: string;
  authors: string;
  year: string;
  title: string;
  venue: string;
  identifier: string;
  url?: string;
  domain: Exclude<RefDomain, 'all'>;
  roleLabel: string;
  usedItems: string[];
  codeFiles: string[];
}

const REFERENCES: ReferenceEntry[] = [
  {
    id: 'gurreri_2017',
    authors: 'Gurreri, L., Battaglia, G., Tamburini, A., Cipollina, A., Micale, G., & Ciofalo, M.',
    year: '2017',
    title: 'Multi-physical modelling of reverse electrodialysis',
    venue: 'Desalination, 423, 52–64',
    identifier: 'DOI: 10.1016/j.desal.2017.09.006',
    url: 'https://doi.org/10.1016/j.desal.2017.09.006',
    domain: 'transport',
    roleLabel: 'Primary 2D PDE Model & Baseline Benchmark',
    usedItems: [
      '2D empty-channel periodic unit cell-pair domain (H = 270 μm, L = 10 cm, δ_m = 125 μm) separating HC (500 mol/m³) and LC (17 mol/m³) NaCl streams at ū = 1.0 cm/s, T = 298.15 K.',
      'Coupled laminar Poiseuille hydrodynamics, Nernst–Planck species advection–diffusion–migration, local electroneutrality, and interfacial Donnan jumps resolving transverse concentration polarization c_wall(x) ≠ c_bulk(x).',
      'Reference aqueous viscosity (8.90 × 10⁻⁴ Pa·s), Na⁺/Cl⁻ diffusivities, and quantitative validation targets (Δp = 146.50 Pa, OCV ≈ 155 mV, P_gross ≈ 3.80 W/m², P_pump ≈ 0.010 W/m²).',
    ],
    codeFiles: [
      'src/flow_solver.py',
      'src/physics_transport.py',
      'lib/redSolver2d.ts',
      'data/benchmark_cases/gurreri_2017_benchmark.csv',
    ],
  },
  {
    id: 'tedesco_2016',
    authors: 'Tedesco, M., Hamelers, H. V. M., & Biesheuvel, P. M.',
    year: '2016',
    title: 'Nernst–Planck transport theory for (reverse) electrodialysis: I. Effect of co-ion transport through the membranes',
    venue: 'Journal of Membrane Science, 510, 370–381',
    identifier: 'DOI: 10.1016/j.memsci.2016.03.012',
    url: 'https://doi.org/10.1016/j.memsci.2016.03.012',
    domain: 'transport',
    roleLabel: 'Donnan Partitioning & Co-Ion Leakage Theory',
    usedItems: [
      'Membrane fixed-charge density formulation (X_CEM = -2000 mol/m³, X_AEM = +2000 mol/m³, swept 1500–4000 mol/m³ in Stage 1).',
      'Analytical 1:1 Donnan co-ion partitioning c_co^m and local apparent permselectivity degradation α = |X| / (|X| + 2 c_co^m) at high salinity.',
      'Multi-ion membrane diffusivity ratios separating monovalent counter-ions (0.08 × D_aq), divalent counter-ions with hydrated-radius retardation (0.025 × D_aq), and co-ion leakage ratios (0.0008 / 0.00025 × D_aq).',
    ],
    codeFiles: [
      'src/physics_transport.py',
      'src/multicomponent_transport.py',
      'lib/multicomponentSolver2d.ts',
      'configs/multicomponent_transport.yaml',
    ],
  },
  {
    id: 'long_2018',
    authors: 'Long, R., Li, B., Liu, Z., & Liu, W.',
    year: '2018',
    title: 'Performance analysis of reverse electrodialysis stacks: Channel geometry and flow rate optimization',
    venue: 'Energy, 158, 427–436',
    identifier: 'DOI: 10.1016/j.energy.2018.06.067',
    url: 'https://doi.org/10.1016/j.energy.2018.06.067',
    domain: 'transport',
    roleLabel: 'Stack Electrical Circuit & Hydraulic Trade-Off',
    usedItems: [
      'Cell-pair circuit equations for E_OCV, internal area resistance R_int (bulk channels + CEM/AEM membranes with σ_m = 1.0 S/m), and maximum gross power P_gross,max = E_OCV² / (4 R_int).',
      'Parasitic pumping loss P_pump = Σ(Δp · Q) / (η_pump · A) with η_pump = 0.75 and net power optimization P_net = P_gross − P_pump.',
      'Operating velocity sweep bounds (0.3–4.5 cm/s) and algebraic lumped benchmark comparison highlighting boundary-layer polarization losses missing in 1D stack models.',
    ],
    codeFiles: [
      'src/electrical.py',
      'src/validation.py',
      'data/benchmark_cases/long_2018_benchmark.csv',
    ],
  },
  {
    id: 'scharfetter_gummel_1969',
    authors: 'Scharfetter, D. L., & Gummel, H. K.',
    year: '1969',
    title: 'Large-signal analysis of a silicon Read diode oscillator (Exponential Flux Discretization)',
    venue: 'IEEE Transactions on Electron Devices, 16(1), 64–77',
    identifier: 'DOI: 10.1109/T-ED.1969.16566',
    domain: 'transport',
    roleLabel: 'Conservative Electro-Migration Discretization',
    usedItems: [
      'Bernoulli-function Scharfetter–Gummel finite-volume flux discretization B(Pe) = Pe / (e^Pe − 1) for coupled 8-ion Nernst–Planck migration–diffusion terms.',
      'Preserves strict M-matrix positivity (c_k ≥ 0) and exact flux conservation without spurious numerical oscillations under steep transmembrane potential gradients.',
    ],
    codeFiles: [
      'src/multicomponent_transport.py',
      'lib/multicomponentSolver2d.ts',
    ],
  },
  {
    id: 'faghihi_jalali_2022',
    authors: 'Faghihi, P., & Jalali, A.',
    year: '2022',
    title: 'An artificial neural network-based optimization of reverse electrodialysis power generating cells using CFD and genetic algorithm',
    venue: 'International Journal of Energy Research, 46(15), 21217–21233',
    identifier: 'DOI: 10.1002/er.8379',
    url: 'https://doi.org/10.1002/er.8379',
    domain: 'transport',
    roleLabel: 'CFD-to-Neural Surrogate Design Motivation',
    usedItems: [
      'Established the requirement that CFD training datasets for RED neural surrogates / PINNs must resolve wall boundary-layer concentration gradients across velocity (0.5–5 cm/s) and geometry sweeps rather than relying on bulk-only lumped averages.',
      'Directly motivated storing complete 2D spatial arrays (u, v, c_k, φ, J_wall) in .npz archives.',
    ],
    codeFiles: [
      'LITERATURE_REVIEW.md',
      'data/clean_cases/generated/*.npz',
      'data/multicomponent_brines/generated/*.npz',
    ],
  },
  {
    id: 'plummer_parkhurst_2013',
    authors: 'Plummer, L. N., Parkhurst, D. L., Fleming, G. W., & Dunkle, S. A. (1988); Parkhurst, D. L., & Appelo, C. A. J. (2013)',
    year: '1988 / 2013',
    title: 'PHRQPITZ & PHREEQC Version 3 (pitzer.dat Database)',
    venue: 'USGS WRI Report 88-4153 & USGS Techniques and Methods 6-A43',
    identifier: 'DOI: 10.3133/wri884153 · 10.3133/tm6A43',
    url: 'https://doi.org/10.3133/tm6A43',
    domain: 'thermodynamics',
    roleLabel: 'High-Ionic-Strength Aqueous Geochemistry Engine',
    usedItems: [
      'Complete USGS pitzer.dat temperature-dependent virial coefficients (β⁽⁰⁾, β⁽¹⁾, β⁽²⁾, C^φ, θ, ψ, λ) serialized cleanly in configs/pitzer_parameters.json.',
      'Aqueous tracer diffusivities D_w at 25 °C for all 8 ions (Na⁺, K⁺, Mg²⁺, Ca²⁺, Cl⁻, SO₄²⁻, HCO₃⁻, CO₃²⁻), mineral molar volumes (Calcite 36.9 cm³/mol, Gypsum 73.9 cm³/mol), and analytic K_sp(T) polynomials (Ellis 1959 / Plummer & Busenberg 1982).',
      'Osmotic water activity a_w² correction inside Gypsum saturation index SI = log10(a_Ca · a_SO4 · a_w² / K_sp).',
    ],
    codeFiles: [
      'configs/pitzer_parameters.json',
      'src/pitzer_model.py',
      'lib/pitzerModel.ts',
    ],
  },
  {
    id: 'hmw_1984',
    authors: 'Harvie, C. E., Møller, N., & Weare, J. H.',
    year: '1984',
    title: 'The prediction of mineral solubilities in natural waters: The Na–K–Mg–Ca–H–Cl–SO₄–OH–HCO₃–CO₃–CO₂–H₂O system to high ionic strengths at 25°C',
    venue: 'Geochimica et Cosmochimica Acta, 48(4), 723–751',
    identifier: 'DOI: 10.1016/0016-7037(84)90098-X',
    domain: 'thermodynamics',
    roleLabel: 'HMW Pitzer Virial Mixing Formulation',
    usedItems: [
      'Provides the 8-ion electrolyte mixing framework with electrostatic unsymmetrical mixing terms (E_θ, E′_θ) and osmotic coefficient calculation required accurately up to hypersaline brines (I > 1.6 mol/kg).',
      'Eliminates the systematic Davies over-prediction above I > 0.5 mol/kg in Gypsum and Calcite RO concentrate scaling assessments.',
    ],
    codeFiles: [
      'src/pitzer_model.py',
      'lib/pitzerModel.ts',
      'results/figures/fig11_gypsum_scaling_risk_comparison.png',
    ],
  },
  {
    id: 'robinson_stokes',
    authors: 'Robinson, R. A., & Stokes, R. H.',
    year: '1959 / 2002',
    title: 'Electrolyte Solutions (2nd ed.)',
    venue: 'Butterworths / Dover Publications',
    identifier: 'ISBN: 978-0486422251',
    domain: 'thermodynamics',
    roleLabel: 'Activity Coefficient & Diffusivity Validation Reference',
    usedItems: [
      'Tabulated experimental mean ionic activity coefficients γ_±(NaCl) from 0.1 to 4.0 mol/kg used as an executable verification benchmark for our Pitzer solver.',
      'Reference aqueous infinite-dilution ionic diffusivities for Na⁺ (1.334 × 10⁻⁹ m²/s) and Cl⁻ (2.032 × 10⁻⁹ m²/s) and Nernst–Hartley ambipolar D_eff = 1.611 × 10⁻⁹ m²/s.',
    ],
    codeFiles: [
      'data/benchmark_cases/pitzer_nacl_robinson_stokes.csv',
      'data/benchmark_cases/pitzer_gypsum_salting_in.csv',
      'results/figures/fig13_scaling_benchmark_comparisons.png',
    ],
  },
  {
    id: 'santoro_2021',
    authors: 'Santoro, S., Tufa, R. A., Avci, A. H., Fontananova, E., Di Profio, G., & Curcio, E.',
    year: '2021',
    title: 'Fouling propensity in reverse electrodialysis operated with hypersaline brine',
    venue: 'Energy, 228, 120563',
    identifier: 'DOI: 10.1016/j.energy.2021.120563',
    url: 'https://doi.org/10.1016/j.energy.2021.120563',
    domain: 'scaling_cnt',
    roleLabel: 'Heterogeneous CNT Nucleation & CEM Scaling Mechanism',
    usedItems: [
      'Classical Nucleation Theory (CNT) heterogeneous nucleation energy barrier ΔG*_het / (k_B T) = f(θ_eff) · ΔG*_hom / (k_B T) and critical nucleus radius r* evaluated directly at CEM/AEM wall saturation.',
      'Establishes preferential Ca²⁺ partitioning and calcite scaling threat on hydrophilic CEM surfaces vs AEM surfaces, plus benchmark verification points across Ω and θ.',
      'Grounds our Category A (Clean) / Category B (Scaling-Risk) / Category C (Nucleation-Prone) classification scheme without fabricating uncalibrated crystal-growth trajectories.',
    ],
    codeFiles: [
      'src/nucleation_model.py',
      'lib/pitzerModel.ts',
      'configs/calcite_scaling.yaml',
      'data/benchmark_cases/santoro_2021_calcite_cnt.csv',
    ],
  },
  {
    id: 'sohnel_he_interfacial',
    authors: 'Söhnel, O., & Mullin, J. W. (1982); He, S., Oddo, J. E., & Tomson, M. B. (1994)',
    year: '1982 / 1994',
    title: 'Calcite & Gypsum Solid–Liquid Interfacial Energies (γ_sl)',
    venue: 'J. Crystal Growth 60(2) (Calcite) & Ind. Eng. Chem. Res. / Langmuir (Gypsum)',
    identifier: 'Parameter Provenance Table 2 / Eq. 7',
    domain: 'scaling_cnt',
    roleLabel: 'Crystal–Water Interfacial Tension Constants',
    usedItems: [
      'Calcite–water baseline interfacial tension γ_sl = 0.094 J/m² (sensitivity range 0.080–0.105 J/m²) from Söhnel & Mullin (1982).',
      'Gypsum–water baseline interfacial tension γ_sl = 0.037 J/m² (sensitivity range 0.025–0.045 J/m²) from He et al. (1994).',
    ],
    codeFiles: [
      'configs/calcite_scaling.yaml',
      'configs/gypsum_scaling.yaml',
      'reports/parameter_provenance.csv',
    ],
  },
  {
    id: 'wenzel_fujifilm',
    authors: 'Wenzel, R. N. (1936) & Fujifilm Type 10 Characterization Studies',
    year: '1936 / 2019–2023',
    title: 'Wenzel Roughness Wetting Law & Fujifilm Type 10 IEM Properties',
    venue: 'Ind. Eng. Chem. 28(8) & Membranes [PMC6918471 / PMC9864938]',
    identifier: 'PMC6918471 · PMC9864938',
    domain: 'scaling_cnt',
    roleLabel: 'Surface Wettability & Membrane Calibration',
    usedItems: [
      'Wenzel roughness modulation cos(θ_eff) = r · cos(θ₀) (r swept 1.0–1.8) adjusting wetting factor f(θ_eff) inside CNT barrier calculations.',
      'Fujifilm Type 10 CEM/AEM experimental benchmarks (thickness 135/125 μm, areal resistance 2.0/1.3 Ω·cm², permselectivity 0.99/0.92, contact angles θ₀ = 55°/65°) used to validate intra-membrane counter-ion diffusivity scaling.',
    ],
    codeFiles: [
      'configs/calcite_scaling.yaml',
      'configs/multicomponent_transport.yaml',
      'src/nucleation_model.py',
    ],
  },
  {
    id: 'abdel_aal_sorour',
    authors: 'Abdel-Aal, E. A. et al. (2021) & Sorour, M. H. et al. (2015)',
    year: '2015 / 2021',
    title: 'Chemical Precipitation & Brine Characterization of Mediterranean RO Reject Streams',
    venue: 'Membranes, 11(3), 212 [PMC8002872] & Desalin. Water Treat., 55(9)',
    identifier: 'PMC8002872 · DOI: 10.1080/19443994.2014.946720',
    domain: 'brines',
    roleLabel: 'Egyptian Mediterranean & Brackish RO Brine Profiles',
    usedItems: [
      'Complete 8-major-ion compositions for El-Remel SWRO Mediterranean feed (39.8 g/L TDS, pH 8.0) and reject brine (57.1 g/L TDS, pH 8.1) from Table 1.',
      'Complete 8-major-ion composition for Shammas Egyptian Brackish Groundwater RO reject brine (15.1 g/L TDS, pH 8.0) from Table 2.',
    ],
    codeFiles: [
      'configs/brine_profiles.yaml',
      'data/multicomponent_brines/case_metadata.csv',
      'data/metadata/brine_audit.csv',
    ],
  },
  {
    id: 'pmc9694509_med',
    authors: 'SWRO–PRO Hybrid Desalination Study',
    year: '2022',
    title: 'Mediterranean Seawater Feed Ion Speciation (SWRO–PRO Study)',
    venue: 'Membranes, 12(11), 1045 (Table 2)',
    identifier: 'PMC9694509',
    domain: 'brines',
    roleLabel: 'Elevated-Temperature Mediterranean Feed Profile',
    usedItems: [
      'Complete 8-major-ion Mediterranean seawater analysis at 28 °C (301.15 K), pH 8.1, TDS 40.6 g/L (plus context on trace SiO₂ = 1.61 mg/L, B = 5.03 mg/L, F⁻ = 1.39 mg/L).',
    ],
    codeFiles: [
      'configs/brine_profiles.yaml',
      'data/multicomponent_brines/case_metadata.csv',
    ],
  },
  {
    id: 'tda_egypt_red_sea',
    authors: 'Tourism Development Authority (TDA) Egypt — Coastal Desalination Audit',
    year: 'Official Audit',
    title: 'Environmental Audit of Red Sea Coastal Desalination Plants',
    venue: 'TDA Egypt (tda.gov.eg)',
    identifier: 'tda.gov.eg Environmental Audit Tables',
    domain: 'brines',
    roleLabel: 'Red Sea SWRO Feed & Hypersaline Brine Profiles',
    usedItems: [
      'Red Sea SWRO Feed (40.5 g/L TDS, pH 8.1) and Red Sea ~50% recovery Reject Brine (80.0 g/L TDS, pH 7.8) major ion measurements.',
      'Explicitly computes CO₃²⁻ thermodynamically from measured HCO₃⁻ and pH because CO₃²⁻ is marked null in the raw audit table (never fabricated arbitrarily).',
    ],
    codeFiles: [
      'configs/brine_profiles.yaml',
      'src/brine_chemistry.py',
      'data/metadata/brine_audit.csv',
    ],
  },
  {
    id: 'vermaas_2013',
    authors: 'Vermaas, D. A., Kunteng, D., Saakes, M., & Nijmeijer, K.',
    year: '2013',
    title: 'Fouling in reverse electrodialysis under natural conditions',
    venue: 'Water Research, 47(3), 1289–1298',
    identifier: 'DOI: 10.1016/j.watres.2012.11.053',
    url: 'https://doi.org/10.1016/j.watres.2012.11.053',
    domain: 'boundaries',
    roleLabel: 'Organic / Colloidal / Biofouling Scope Boundary',
    usedItems: [
      'Provides the multi-mechanism taxonomy distinguishing inorganic scaling from organic fouling (humic acid/alginate), colloidal clay/silica fouling, and biofouling/EPS.',
      'Enforces REDMind v2.1.0 scientific integrity policy: isolates inorganic CaCO₃ / CaSO₄·2H₂O thermodynamics and refuses to fabricate unverified biological or organic kinetic equations.',
    ],
    codeFiles: [
      'reports/literature_review.md',
      'reports/limitations.md',
    ],
  },
  {
    id: 'mujahid_2026_santoro_2024',
    authors: 'Mujahid, M. et al. (2026) & Santoro, S. et al. (2024)',
    year: '2026 / 2024',
    title: 'Gypsum + Silica Impurity Benchmark Notes & Hypersaline IC Audit Exclusion',
    venue: 'Sep. Purif. Technol. 390, 136960 (Mujahid 2026) · Membranes 14(4), 87 [PMC11052490] (Santoro 2024)',
    identifier: 'DOI: 10.1016/j.seppur.2026.136960 · PMC11052490',
    domain: 'boundaries',
    roleLabel: 'Paywall Integrity & Charge-Balance Audit Exclusion',
    usedItems: [
      'Mujahid et al. (2026): Abstract-verified 4 thermodynamic Gypsum + NaCl benchmark states (mujahid_2026_gypsum_silica_notes.json); full experimental silica time-series excluded due to paywall, and parametric ΔR_m runs isolated as Exploratory sensitivity scenarios.',
      'Santoro et al. (2024): Audited in brine_audit.csv (89.0 g/L TDS) and explicitly excluded from PDE transport runs because raw IC omits HCO₃⁻ & pH and shows a 13.8% cation excess.',
    ],
    codeFiles: [
      'data/benchmark_cases/mujahid_2026_gypsum_silica_notes.json',
      'configs/gypsum_scaling.yaml',
      'configs/brine_profiles.yaml',
      'data/metadata/brine_audit.csv',
    ],
  },
];

const DOMAIN_TABS: Array<{ id: RefDomain; label: string }> = [
  { id: 'all', label: 'All References (16)' },
  { id: 'transport', label: '2D Transport & Electrochemistry (5)' },
  { id: 'thermodynamics', label: 'Pitzer & Aqueous Chemistry (3)' },
  { id: 'scaling_cnt', label: 'Scaling & CNT Nucleation (3)' },
  { id: 'brines', label: 'Real Brine Audits (3)' },
  { id: 'boundaries', label: 'Fouling Scope & Exclusions (2)' },
];

export const ReferencesView: React.FC<{
  onOpenReport?: () => void;
}> = ({ onOpenReport }) => {
  const [domain, setDomain] = useState<RefDomain>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return REFERENCES.filter((ref) => {
      if (domain !== 'all' && ref.domain !== domain) return false;
      if (!q) return true;
      return (
        ref.authors.toLowerCase().includes(q) ||
        ref.title.toLowerCase().includes(q) ||
        ref.venue.toLowerCase().includes(q) ||
        ref.roleLabel.toLowerCase().includes(q) ||
        ref.usedItems.some((u) => u.toLowerCase().includes(q)) ||
        ref.codeFiles.some((f) => f.toLowerCase().includes(q))
      );
    });
  }, [domain, search]);

  return (
    <div className="space-y-5">
      {/* Intro & Search */}
      <div className="border border-[#1C2536] bg-[#0E131D] rounded p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <BookMarked className="w-4 h-4 text-cyan-400" />
            <span>
              Complete Literature Provenance — Papers, Extracted Physics &amp; Audit Exclusions
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-3xl">
            Every governing PDE, Donnan interface equation, HMW Pitzer virial table, CNT interfacial energy, regional desalination brine profile, and excluded boundary in REDMind v2.1.0 is mapped below to its exact source paper and file.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search author, equation, brine, or file..."
              className="bg-[#080B11] border border-[#2C3A52] rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 w-64"
            />
          </div>
          {onOpenReport && (
            <button
              type="button"
              onClick={onOpenReport}
              className="px-3 py-1.5 text-xs font-medium rounded border border-[#2C3A52] bg-[#131A27] text-cyan-300 hover:bg-[#1C2536] whitespace-nowrap"
            >
              Read Full literature_review.md →
            </button>
          )}
        </div>
      </div>

      {/* Domain Filter Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[#1C2536]">
        {DOMAIN_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setDomain(t.id)}
            className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              domain === t.id
                ? 'border-cyan-400 text-cyan-300 bg-[#0E131D]'
                : 'border-transparent text-slate-400 hover:text-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="text-xs font-mono tabular-nums text-slate-400">
        Showing {filtered.length} of {REFERENCES.length} documented literature sources
      </div>

      {/* Structured Reference Ledger */}
      <div className="space-y-3">
        {filtered.map((ref, idx) => (
          <article
            key={ref.id}
            className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden"
          >
            <div className="px-4 py-3 bg-[#131A27] border-b border-[#1C2536] flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-mono text-cyan-400 tabular-nums">
                    [{String(idx + 1).padStart(2, '0')}]
                  </span>
                  <h3 className="text-sm font-semibold text-slate-100">
                    {ref.authors} ({ref.year})
                  </h3>
                </div>
                <div className="text-xs text-slate-300 font-medium">
                  “{ref.title}” — <span className="italic text-slate-400">{ref.venue}</span>
                </div>
              </div>

              <div className="text-right shrink-0 space-y-0.5">
                <div
                  className={`text-xs font-mono font-semibold ${
                    ref.domain === 'boundaries'
                      ? 'text-amber-300'
                      : ref.domain === 'thermodynamics' || ref.domain === 'scaling_cnt'
                        ? 'text-emerald-300'
                        : 'text-cyan-300'
                  }`}
                >
                  {ref.roleLabel}
                </div>
                <div className="text-[11px] font-mono text-slate-400 flex items-center justify-end gap-1.5">
                  <span>{ref.identifier}</span>
                  {ref.url && (
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 inline-flex items-center"
                      title="Open publisher DOI"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
              <div className="lg:col-span-8 space-y-1.5">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  What Was Extracted &amp; Implemented in REDMind
                </div>
                <ul className="space-y-1.5 text-slate-300 leading-relaxed list-disc pl-4">
                  {ref.usedItems.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-[#1C2536] pt-3 lg:pt-0 lg:pl-4 space-y-1.5">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  Direct Codebench &amp; Config Paths
                </div>
                <div className="space-y-1 font-mono text-[11px] text-cyan-300">
                  {ref.codeFiles.map((cf) => (
                    <div key={cf} className="truncate">
                      {cf}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
