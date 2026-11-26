"""
High-ionic-strength Pitzer electrolyte thermodynamics and mineral equilibrium module.

Implements the Harvie-Moller-Weare (1984) / Plummer et al. (1988) Pitzer virial
ion-interaction model parameterized directly from the official USGS PHREEQC
pitzer.dat database (stored in configs/pitzer_parameters.json).

Supported ions:
    Na+, K+, Mg2+, Ca2+, H+, Cl-, SO4(2-), HSO4-, HCO3-, CO3(2-), OH-
Supported mineral phases:
    Calcite (CaCO3), Aragonite (CaCO3), Gypsum (CaSO4*2H2O), Halite (NaCl)

References:
    - Pitzer, K. S. (1991), Activity Coefficients in Electrolyte Solutions, 2nd ed.
    - Harvie, C. E., Moller, N., & Weare, J. H. (1984), Geochim. Cosmochim. Acta 48, 723-751.
    - Plummer, L. N. et al. (1988), USGS WRI Report 88-4153 (PHRQPITZ).
    - Parkhurst, D. L. & Appelo, C. A. J. (2013), USGS Techniques and Methods 6-A43 (PHREEQC v3).
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass, field
from typing import Dict, Tuple, Optional, List

import numpy as np

_DATA_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "configs", "pitzer_parameters.json")
)
with open(_DATA_PATH, "r", encoding="utf-8") as _f:
    _PITZER_DB = json.load(_f)

MOLAR_MASS_H2O = 0.01801528  # kg/mol
TR_REF = 298.15  # K

ION_CHARGES: Dict[str, int] = {
    "H+": 1,
    "Na+": 1,
    "K+": 1,
    "Mg+2": 2,
    "Ca+2": 2,
    "Cl-": -1,
    "HSO4-": -1,
    "HCO3-": -1,
    "OH-": -1,
    "SO4-2": -2,
    "CO3-2": -2,
    "MgCO3": 0,
}

# Canonical short name mapping for REDMind dataset interoperability
CANONICAL_TO_PHREEQC = {
    "H": "H+",
    "Na": "Na+",
    "K": "K+",
    "Mg": "Mg+2",
    "Ca": "Ca+2",
    "Cl": "Cl-",
    "HSO4": "HSO4-",
    "HCO3": "HCO3-",
    "OH": "OH-",
    "SO4": "SO4-2",
    "CO3": "CO3-2",
}

MOLAR_MASS_G_MOL = {
    "Na+": 22.989769,
    "K+": 39.0983,
    "Mg+2": 24.305,
    "Ca+2": 40.078,
    "Cl-": 35.453,
    "SO4-2": 96.0626,
    "HCO3-": 61.0168,
    "CO3-2": 60.0089,
    "H+": 1.00794,
    "OH-": 17.00734,
    "HSO4-": 97.0705,
    "MgCO3": 84.3139,
}


def debye_huckel_aphi(T_K: float) -> float:
    """
    Calculate Pitzer Debye-Huckel osmotic parameter A_phi (kg/mol)^0.5 at T_K.
    Polynomial fit from Clegg & Whitfield (1991) / Spencer, Moller & Weare (1990)
    matching Bradley & Pitzer (1979) across 273-373 K (0.39148 at 298.15 K).
    """
    t_c = T_K - 273.15
    # Bradley & Pitzer (1979) dielectric constant & Kell water density fit
    # Accurate to <2e-4 across 0-100 C:
    # A_phi(T) = 0.3770 + 4.684e-4*t + 3.74e-6*t^2 (Ananthaswamy & Atkinson / Clegg)
    # Using exact electrostatic formula with Uematsu-Franck / Bradley-Pitzer eps(T) and rho(T):
    rho_w = (
        999.83952
        + 16.945176 * t_c
        - 7.9870401e-3 * t_c**2
        - 46.170461e-6 * t_c**3
        + 105.56302e-9 * t_c**4
        - 280.54253e-12 * t_c**5
    ) / (1.0 + 16.879850e-3 * t_c) / 1000.0  # g/cm3 = kg/L
    # Bradley-Pitzer (1979) static dielectric constant of water at 1 bar
    U = [
        3.4279e2,
        -5.0866e-3,
        9.4690e-7,
        -2.0525,
        3.1159e3,
        -1.8289e2,
        -8.0325e3,
        4.2142e6,
        2.1417,
    ]
    eps1000 = U[0] * math.exp(U[1] * T_K + U[2] * T_K**2)
    C_bp = U[3] + U[4] / (U[5] + T_K)
    B_bp = U[6] + U[7] / T_K + U[8] * T_K
    eps = eps1000 + C_bp * math.log((B_bp + 1.0) / (B_bp + 1000.0))
    # Fundamental A_phi = (1/3) * (2*pi*N_A*rho_w/1000)^0.5 * (e^2 / (4*pi*eps_0*eps*k*T))^1.5
    # In CGS-ESU (Pitzer 1991): e = 4.803204e-10 esu, k = 1.380649e-16 erg/K, N_A = 6.02214076e23
    N_A = 6.02214076e23
    e_esu = 4.80320425e-10
    k_B = 1.380649e-16
    a_phi = (1.0 / 3.0) * math.sqrt(2.0 * math.pi * N_A * rho_w / 1000.0) * (
        (e_esu**2) / (eps * k_B * T_K)
    ) ** 1.5
    return float(a_phi)


def _phreeqc_pitzer_param(coeffs: List[float], T_K: float) -> float:
    """Evaluate PHREEQC PITZER temperature polynomial around T_R = 298.15 K."""
    c = list(coeffs) + [0.0] * (6 - len(coeffs))
    if abs(T_K - TR_REF) < 1e-9:
        return float(c[0])
    inv_T = 1.0 / T_K - 1.0 / TR_REF
    ln_T = math.log(T_K / TR_REF)
    dT = T_K - TR_REF
    dT2 = T_K**2 - TR_REF**2
    inv_T2 = 1.0 / (T_K**2) - 1.0 / (TR_REF**2)
    return float(c[0] + c[1] * inv_T + c[2] * ln_T + c[3] * dT + c[4] * dT2 + c[5] * inv_T2)


def _phreeqc_logk(T_K: float, coeffs: Optional[List[float]], fallback_log_k: float) -> float:
    """Evaluate PHREEQC -analytical_expression log10(K(T))."""
    if not coeffs:
        return float(fallback_log_k)
    a = list(coeffs) + [0.0] * (6 - len(coeffs))
    return float(a[0] + a[1] * T_K + a[2] / T_K + a[3] * math.log10(T_K) + a[4] / (T_K**2) + a[5] * (T_K**2))


def get_phase_log_ksp(phase: str, T_K: float = 298.15, use_analytic: bool = True) -> float:
    """Return log10(Ksp(T)) for Calcite, Aragonite, Gypsum, Anhydrite, or Halite from USGS pitzer.dat."""
    p = _PITZER_DB["phases"][phase]
    if use_analytic and "analytic" in p:
        return _phreeqc_logk(T_K, p["analytic"], p.get("log_k", 0.0))
    return float(p["log_k"])


def _get_param(block: str, *ions: str, T_K: float = 298.15) -> float:
    key = "|".join(sorted(ions))
    coeffs = _PITZER_DB["pitzer"][block].get(key)
    if coeffs is None:
        return 0.0
    return _phreeqc_pitzer_param(coeffs, T_K)


def _pitzer_g(x: float) -> float:
    if x < 1e-8:
        return 1.0
    return 2.0 * (1.0 - (1.0 + x) * math.exp(-x)) / (x * x)


def _pitzer_g_prime(x: float) -> float:
    if x < 1e-8:
        return 0.0
    return -2.0 * (1.0 - (1.0 + x + 0.5 * x * x) * math.exp(-x)) / (x * x)


def _pitzer_J_and_Jprime(x: float) -> Tuple[float, float]:
    """
    Pitzer (1975) short-range approximation for unsymmetrical mixing integral J(x) and J'(x).
    Standard Harvie & Weare (1980) / Plummer et al. (1988) approximation (x > 0).
    """
    if x <= 0.0:
        return 0.0, 0.0
    C1, C2, C3, C4 = 4.581, 0.7237, 0.0120, 0.528
    u = x ** (-C2)
    v = x ** C4
    ex = math.exp(-C3 * v)
    D = 4.0 + C1 * u * ex
    J = x / D
    # Derivative dD/dx = C1 * ex * u * (-C2/x - C3*C4 * v / x)
    dD_dx = C1 * u * ex * (-C2 - C3 * C4 * v) / x
    Jprime = (D - x * dD_dx) / (D * D)
    return J, Jprime


def _etheta_and_prime(z1: int, z2: int, I: float, A_phi: float) -> Tuple[float, float]:
    """Unsymmetrical electrostatic mixing terms E_theta_ij(I) and d(E_theta)/dI."""
    if z1 == z2 or z1 == 0 or z2 == 0 or I <= 1e-12:
        return 0.0, 0.0
    sqrt_I = math.sqrt(I)
    coeff = 6.0 * z1 * z2 * A_phi
    x12 = coeff * sqrt_I
    x11 = 6.0 * z1 * z1 * A_phi * sqrt_I
    x22 = 6.0 * z2 * z2 * A_phi * sqrt_I
    J12, Jp12 = _pitzer_J_and_Jprime(x12)
    J11, Jp11 = _pitzer_J_and_Jprime(x11)
    J22, Jp22 = _pitzer_J_and_Jprime(x22)

    E_theta = (z1 * z2 / (4.0 * I)) * (J12 - 0.5 * J11 - 0.5 * J22)
    # dJ(x_ab)/dI = J'(x_ab) * 0.5 * x_ab / I
    dJ12_dI = Jp12 * 0.5 * x12 / I
    dJ11_dI = Jp11 * 0.5 * x11 / I
    dJ22_dI = Jp22 * 0.5 * x22 / I
    E_theta_p = -E_theta / I + (z1 * z2 / (4.0 * I)) * (dJ12_dI - 0.5 * dJ11_dI - 0.5 * dJ22_dI)
    return float(E_theta), float(E_theta_p)


@dataclass
class PitzerActivityResult:
    """Complete Pitzer activity and osmotic output for an aqueous electrolyte."""
    temperature_K: float
    ionic_strength_molal: float
    water_activity: float
    osmotic_coefficient: float
    gamma_molal: Dict[str, float]
    molalities: Dict[str, float]
    charge_balance_error_pct: float


def estimate_brine_density_kg_L(molalities_or_conc_mol_m3: Dict[str, float], is_molal: bool = False, T_K: float = 298.15) -> float:
    """Estimate aqueous brine density (kg/L) from dissolved salt mass fraction (Laliberte-type ~0.997 + 0.72*TDS)."""
    t_c = T_K - 273.15
    rho0 = (
        999.83952
        + 16.945176 * t_c
        - 7.9870401e-3 * t_c**2
        - 46.170461e-6 * t_c**3
    ) / (1.0 + 16.879850e-3 * t_c) / 1000.0
    if is_molal:
        solute_g_per_kg_w = sum(m * MOLAR_MASS_G_MOL.get(sp, 0.0) for sp, m in molalities_or_conc_mol_m3.items())
        w_salt = solute_g_per_kg_w / (1000.0 + solute_g_per_kg_w)
        return float(rho0 + 0.72 * w_salt)
    else:
        tds_g_L = sum((c / 1000.0) * MOLAR_MASS_G_MOL.get(sp, 0.0) for sp, c in molalities_or_conc_mol_m3.items())
        return float(rho0 + 0.72e-3 * tds_g_L)


def conc_mol_m3_to_molality(conc_mol_m3: Dict[str, float], T_K: float = 298.15) -> Dict[str, float]:
    """Convert molar concentrations (mol/m3) to true molality (mol/kg H2O) accounting for brine density and TDS."""
    # Map short names if passed
    mapped = {CANONICAL_TO_PHREEQC.get(k, k): float(v) for k, v in conc_mol_m3.items() if v > 0.0}
    rho_kg_L = estimate_brine_density_kg_L(mapped, is_molal=False, T_K=T_K)
    tds_kg_L = sum((c / 1000.0) * MOLAR_MASS_G_MOL.get(sp, 0.0) for sp, c in mapped.items()) / 1000.0
    water_kg_per_L = max(rho_kg_L - tds_kg_L, 0.5)
    return {sp: (c / 1000.0) / water_kg_per_L for sp, c in mapped.items()}


def compute_pitzer_activities(molalities: Dict[str, float], T_K: float = 298.15) -> PitzerActivityResult:
    """
    Compute Pitzer single-ion activity coefficients (molal scale), osmotic coefficient,
    and water activity using USGS PHREEQC pitzer.dat parameters.
    """
    m = {CANONICAL_TO_PHREEQC.get(k, k): float(v) for k, v in molalities.items() if v > 0.0}
    cations = [sp for sp in m if ION_CHARGES.get(sp, 0) > 0]
    anions = [sp for sp in m if ION_CHARGES.get(sp, 0) < 0]
    neutrals = [sp for sp in m if ION_CHARGES.get(sp, 0) == 0]

    sum_pos = sum(ION_CHARGES[c] * m[c] for c in cations)
    sum_neg = sum(abs(ION_CHARGES[a]) * m[a] for a in anions)
    cbe_pct = 100.0 * (sum_pos - sum_neg) / max(sum_pos + sum_neg, 1e-30)

    I = 0.5 * sum((ION_CHARGES[sp] ** 2) * val for sp, val in m.items())
    if I <= 1e-12:
        return PitzerActivityResult(
            temperature_K=T_K,
            ionic_strength_molal=0.0,
            water_activity=1.0,
            osmotic_coefficient=1.0,
            gamma_molal={sp: 1.0 for sp in m},
            molalities=m,
            charge_balance_error_pct=cbe_pct,
        )

    sqrt_I = math.sqrt(I)
    Z = sum(abs(ION_CHARGES[sp]) * val for sp, val in m.items())
    A_phi = debye_huckel_aphi(T_K)
    b = 1.2

    # f_gamma and F base Debye-Huckel term
    f_gamma = -A_phi * (sqrt_I / (1.0 + b * sqrt_I) + (2.0 / b) * math.log(1.0 + b * sqrt_I))
    F = f_gamma

    # Binary cation-anion terms: B_ca, B'_ca, B^phi_ca, C_ca
    B_ca: Dict[Tuple[str, str], float] = {}
    Bp_ca: Dict[Tuple[str, str], float] = {}
    Bphi_ca: Dict[Tuple[str, str], float] = {}
    C_ca: Dict[Tuple[str, str], float] = {}

    for c in cations:
        zc = ION_CHARGES[c]
        for a in anions:
            za = abs(ION_CHARGES[a])
            beta0 = _get_param("B0", c, a, T_K=T_K)
            beta1 = _get_param("B1", c, a, T_K=T_K)
            beta2 = _get_param("B2", c, a, T_K=T_K)
            c_phi = _get_param("C0", c, a, T_K=T_K)

            if zc == 2 and za == 2:
                alpha1, alpha2 = 1.4, 12.0
            else:
                alpha1, alpha2 = 2.0, 12.0

            x1 = alpha1 * sqrt_I
            g1 = _pitzer_g(x1)
            gp1 = _pitzer_g_prime(x1)

            B = beta0 + beta1 * g1
            Bp = beta1 * gp1 / I
            Bphi = beta0 + beta1 * math.exp(-x1)

            if abs(beta2) > 0.0:
                x2 = alpha2 * sqrt_I
                g2 = _pitzer_g(x2)
                gp2 = _pitzer_g_prime(x2)
                B += beta2 * g2
                Bp += beta2 * gp2 / I
                Bphi += beta2 * math.exp(-x2)

            C = c_phi / (2.0 * math.sqrt(zc * za))

            B_ca[(c, a)] = B
            Bp_ca[(c, a)] = Bp
            Bphi_ca[(c, a)] = Bphi
            C_ca[(c, a)] = C

            F += m[c] * m[a] * Bp

    # Same-sign mixing terms Phi_ij, Phi'_ij, Phi^phi_ij
    Phi_cc: Dict[Tuple[str, str], float] = {}
    Phiphi_cc: Dict[Tuple[str, str], float] = {}
    for i_idx, c1 in enumerate(cations):
        for c2 in cations[i_idx + 1 :]:
            theta = _get_param("THETA", c1, c2, T_K=T_K)
            e_th, e_th_p = _etheta_and_prime(ION_CHARGES[c1], ION_CHARGES[c2], I, A_phi)
            phi = theta + e_th
            phi_p = e_th_p
            phi_phi = phi + I * phi_p
            Phi_cc[(c1, c2)] = Phi_cc[(c2, c1)] = phi
            Phiphi_cc[(c1, c2)] = phi_phi
            F += m[c1] * m[c2] * phi_p

    Phi_aa: Dict[Tuple[str, str], float] = {}
    Phiphi_aa: Dict[Tuple[str, str], float] = {}
    for i_idx, a1 in enumerate(anions):
        for a2 in anions[i_idx + 1 :]:
            theta = _get_param("THETA", a1, a2, T_K=T_K)
            e_th, e_th_p = _etheta_and_prime(ION_CHARGES[a1], ION_CHARGES[a2], I, A_phi)
            phi = theta + e_th
            phi_p = e_th_p
            phi_phi = phi + I * phi_p
            Phi_aa[(a1, a2)] = Phi_aa[(a2, a1)] = phi
            Phiphi_aa[(a1, a2)] = phi_phi
            F += m[a1] * m[a2] * phi_p

    sum_ca_C = sum(m[c] * m[a] * C_ca[(c, a)] for c in cations for a in anions)

    gamma_out: Dict[str, float] = {}

    # Cation activity coefficients
    for M in cations:
        zM = ION_CHARGES[M]
        ln_g = (zM ** 2) * F
        for a in anions:
            ln_g += m[a] * (2.0 * B_ca[(M, a)] + Z * C_ca[(M, a)])
        for cp in cations:
            if cp != M:
                psi_sum = sum(m[a] * _get_param("PSI", M, cp, a, T_K=T_K) for a in anions)
                ln_g += m[cp] * (2.0 * Phi_cc[(M, cp)] + psi_sum)
        for i_idx, a1 in enumerate(anions):
            for a2 in anions[i_idx + 1 :]:
                ln_g += m[a1] * m[a2] * _get_param("PSI", M, a1, a2, T_K=T_K)
        ln_g += abs(zM) * sum_ca_C
        for n in neutrals:
            ln_g += 2.0 * m[n] * _get_param("LAMBDA", M, n, T_K=T_K)
        gamma_out[M] = float(math.exp(ln_g))

    # Anion activity coefficients
    for X in anions:
        zX = abs(ION_CHARGES[X])
        ln_g = (zX ** 2) * F
        for c in cations:
            ln_g += m[c] * (2.0 * B_ca[(c, X)] + Z * C_ca[(c, X)])
        for ap in anions:
            if ap != X:
                psi_sum = sum(m[c] * _get_param("PSI", c, X, ap, T_K=T_K) for c in cations)
                ln_g += m[ap] * (2.0 * Phi_aa[(X, ap)] + psi_sum)
        for i_idx, c1 in enumerate(cations):
            for c2 in cations[i_idx + 1 :]:
                ln_g += m[c1] * m[c2] * _get_param("PSI", c1, c2, X, T_K=T_K)
        ln_g += zX * sum_ca_C
        for n in neutrals:
            ln_g += 2.0 * m[n] * _get_param("LAMBDA", X, n, T_K=T_K)
        gamma_out[X] = float(math.exp(ln_g))

    # Neutral species
    for n in neutrals:
        ln_g = 2.0 * sum(m[i] * _get_param("LAMBDA", n, i, T_K=T_K) for i in m if i != n)
        gamma_out[n] = float(math.exp(ln_g))

    # Osmotic coefficient phi and water activity a_w
    sum_m = sum(m.values())
    term = -(A_phi * (I ** 1.5)) / (1.0 + b * sqrt_I)
    for c in cations:
        for a in anions:
            term += m[c] * m[a] * (Bphi_ca[(c, a)] + Z * C_ca[(c, a)])
    for i_idx, c1 in enumerate(cations):
        for c2 in cations[i_idx + 1 :]:
            psi_sum = sum(m[a] * _get_param("PSI", c1, c2, a, T_K=T_K) for a in anions)
            term += m[c1] * m[c2] * (Phiphi_cc[(c1, c2)] + psi_sum)
    for i_idx, a1 in enumerate(anions):
        for a2 in anions[i_idx + 1 :]:
            psi_sum = sum(m[c] * _get_param("PSI", c, a1, a2, T_K=T_K) for c in cations)
            term += m[a1] * m[a2] * (Phiphi_aa[(a1, a2)] + psi_sum)

    phi_osm = 1.0 + (2.0 / max(sum_m, 1e-30)) * term
    a_w = math.exp(-phi_osm * MOLAR_MASS_H2O * sum_m)

    return PitzerActivityResult(
        temperature_K=T_K,
        ionic_strength_molal=float(I),
        water_activity=float(a_w),
        osmotic_coefficient=float(phi_osm),
        gamma_molal=gamma_out,
        molalities=m,
        charge_balance_error_pct=float(cbe_pct),
    )


@dataclass
class MineralSaturationResult:
    """Thermodynamic saturation result for Calcite and Gypsum under Pitzer chemistry."""
    temperature_K: float
    pH: Optional[float]
    ionic_strength_molal: float
    water_activity: float
    gamma_ca: float
    gamma_co3: float
    gamma_hco3: float
    gamma_so4: float
    m_ca_free: float
    m_co3_free: float
    m_hco3_free: float
    m_so4_free: float
    iap_calcite: float
    ksp_calcite: float
    omega_calcite: float
    si_calcite: float
    iap_gypsum: float
    ksp_gypsum: float
    omega_gypsum: float
    si_gypsum: float
    davies_si_calcite: float
    davies_si_gypsum: float
    davies_validity_flag: str
    calcite_regime: str
    gypsum_regime: str


def _classify_regime(si: float) -> str:
    if si < -0.1:
        return "Undersaturated"
    if si <= 0.1:
        return "Near-equilibrium"
    return "Supersaturated"


def evaluate_mineral_saturation_pitzer(
    conc_mol_m3: Dict[str, float],
    pH: Optional[float] = 8.1,
    T_K: float = 298.15,
    speciate_carbonate_from_pH: bool = True,
    include_mgco3_pairing: bool = True,
    n_spec_iter: int = 8,
) -> MineralSaturationResult:
    """
    Evaluate Calcite (CaCO3) and Gypsum (CaSO4*2H2O) saturation ratios and Saturation
    Indices using the USGS pitzer.dat Harvie-Moller-Weare thermodynamic model.

    If `speciate_carbonate_from_pH` is True and pH is provided, HCO3-/CO3(2-) speciation
    is computed self-consistently using total inorganic carbonate alkalinity/C(4)
    from input HCO3- + CO3(2-) and Pitzer activity coefficients (including optional
    MgCO3(0) complexation per USGS pitzer.dat).
    """
    m_base = conc_mol_m3_to_molality(conc_mol_m3, T_K=T_K)
    m_work = dict(m_base)

    # Total dissolved Ca, Mg, SO4, and DIC/alkalinity seed
    m_ca_tot = m_base.get("Ca+2", 0.0)
    m_mg_tot = m_base.get("Mg+2", 0.0)
    m_so4_tot = m_base.get("SO4-2", 0.0)
    m_hco3_in = m_base.get("HCO3-", 0.0)
    m_co3_in = m_base.get("CO3-2", 0.0)
    dic_tot = m_hco3_in + m_co3_in

    # Carbonate K1, K2, Kw, K_MgCO3, K_HSO4 from USGS pitzer.dat
    rxns = _PITZER_DB["reactions"]
    k2_log = _phreeqc_logk(T_K, rxns["CO3-2 + H+ = HCO3-"]["analytic"], 10.329)
    k_assoc_hco3 = 10.0 ** k2_log  # {HCO3-} / ({CO3-2}*{H+})
    k1_log = _phreeqc_logk(T_K, rxns["CO3-2 + 2 H+ = CO2 + H2O"]["analytic"], 16.6767)
    k_assoc_co2 = 10.0 ** k1_log   # {CO2} / ({CO3-2}*{H+}^2)
    k_mgco3_log = _phreeqc_logk(T_K, rxns["Mg+2 + CO3-2 = MgCO3"].get("analytic"), 2.928)
    k_mgco3 = 10.0 ** k_mgco3_log
    k_hso4_log = _phreeqc_logk(T_K, rxns["SO4-2 + H+ = HSO4-"]["analytic"], 1.988)
    k_hso4 = 10.0 ** k_hso4_log

    # Initial activity guess
    act = compute_pitzer_activities(m_work, T_K=T_K)

    for _ in range(n_spec_iter):
        g = act.gamma_molal
        g_ca = g.get("Ca+2", 1.0)
        g_mg = g.get("Mg+2", 1.0)
        g_co3 = g.get("CO3-2", 1.0)
        g_hco3 = g.get("HCO3-", 1.0)
        g_so4 = g.get("SO4-2", 1.0)
        g_hso4 = g.get("HSO4-", 1.0)
        a_w = act.water_activity

        if speciate_carbonate_from_pH and pH is not None and dic_tot > 0.0:
            a_H = 10.0 ** (-pH)
            # C_T = [CO2] + [HCO3-] + [CO3^2-] + [MgCO3]
            # {CO3^2-} = g_co3 * [CO3^2-]
            # [HCO3-] = k_assoc_hco3 * a_H * g_co3 / g_hco3 * [CO3^2-]
            # [CO2]   = k_assoc_co2 * a_H^2 * g_co3 * [CO3^2-] / (g_co2 * a_w ~ 1)
            # [MgCO3] = k_mgco3 * g_mg * [Mg2+] * g_co3 * [CO3^2-]
            r_hco3 = k_assoc_hco3 * a_H * (g_co3 / max(g_hco3, 1e-12))
            r_co2 = k_assoc_co2 * (a_H ** 2) * g_co3 / max(a_w, 0.2)
            mg_free = m_work.get("Mg+2", m_mg_tot)
            r_mgco3 = (k_mgco3 * g_mg * mg_free * g_co3) if include_mgco3_pairing else 0.0
            denom = 1.0 + r_hco3 + r_co2 + r_mgco3
            m_co3_free = dic_tot / denom
            m_hco3_free = r_hco3 * m_co3_free
            m_mgco3_pair = r_mgco3 * m_co3_free
            m_work["CO3-2"] = m_co3_free
            m_work["HCO3-"] = m_hco3_free
            if include_mgco3_pairing:
                m_work["Mg+2"] = max(m_mg_tot - m_mgco3_pair, 1e-12)
                m_work["MgCO3"] = m_mgco3_pair
        elif include_mgco3_pairing and m_co3_in > 0.0 and m_mg_tot > 0.0:
            # Fixed CO3 + MgCO3 association equilibrium without altering input HCO3
            # [MgCO3] = K * g_mg * (Mg_tot - x) * g_co3 * (CO3_tot - x)
            K_eff = k_mgco3 * g_mg * g_co3
            b_q = -(K_eff * (m_mg_tot + m_co3_in) + 1.0)
            c_q = K_eff * m_mg_tot * m_co3_in
            disc = max(b_q * b_q - 4.0 * K_eff * c_q, 0.0)
            x_pair = (-b_q - math.sqrt(disc)) / (2.0 * K_eff) if K_eff > 1e-12 else 0.0
            m_work["CO3-2"] = max(m_co3_in - x_pair, 1e-15)
            m_work["Mg+2"] = max(m_mg_tot - x_pair, 1e-12)
            m_work["MgCO3"] = x_pair

        # HSO4- partition if pH is known (important mainly below pH 4)
        if pH is not None and m_so4_tot > 0.0:
            a_H = 10.0 ** (-pH)
            r_hso4 = k_hso4 * a_H * (g_so4 / max(g_hso4, 1e-12))
            m_so4_free = m_so4_tot / (1.0 + r_hso4)
            m_work["SO4-2"] = m_so4_free
            if r_hso4 > 1e-6:
                m_work["HSO4-"] = m_so4_tot - m_so4_free
            else:
                m_work.pop("HSO4-", None)

        act = compute_pitzer_activities(m_work, T_K=T_K)

    g = act.gamma_molal
    g_ca = g.get("Ca+2", 1.0)
    g_co3 = g.get("CO3-2", 1.0)
    g_hco3 = g.get("HCO3-", 1.0)
    g_so4 = g.get("SO4-2", 1.0)
    a_w = act.water_activity

    m_ca_free = m_work.get("Ca+2", 0.0)
    m_co3_free = m_work.get("CO3-2", 0.0)
    m_hco3_free = m_work.get("HCO3-", 0.0)
    m_so4_free = m_work.get("SO4-2", 0.0)

    a_ca = g_ca * m_ca_free
    a_co3 = g_co3 * m_co3_free
    a_so4 = g_so4 * m_so4_free

    iap_cal = max(a_ca * a_co3, 1e-30)
    ksp_cal = 10.0 ** get_phase_log_ksp("Calcite", T_K=T_K, use_analytic=True)
    omega_cal = iap_cal / ksp_cal
    si_cal = math.log10(max(omega_cal, 1e-30))

    # Gypsum: CaSO4:2H2O <=> Ca2+ + SO4(2-) + 2 H2O => IAP = a_Ca * a_SO4 * a_w^2
    iap_gyp = max(a_ca * a_so4 * (a_w ** 2), 1e-30)
    # Note: USGS pitzer.dat lists log_k = -4.58 (Harvie-Moller-Weare / Blount & Dickson 1973);
    # Appelo analytical fits give -4.6005 at 25 C. Standard PHREEQC uses -analytic when present.
    ksp_gyp = 10.0 ** get_phase_log_ksp("Gypsum", T_K=T_K, use_analytic=False)
    omega_gyp = iap_gyp / ksp_gyp
    si_gyp = math.log10(max(omega_gyp, 1e-30))

    # Davies comparison (to illustrate breakdown at I > 0.5 mol/kg)
    I_mol = act.ionic_strength_molal
    sqrt_I = math.sqrt(max(I_mol, 0.0))
    A_dh = 0.5092
    log_g2_dav = -A_dh * 4.0 * (sqrt_I / (1.0 + sqrt_I) - 0.3 * I_mol) if I_mol > 1e-12 else 0.0
    g2_dav = 10.0 ** log_g2_dav
    iap_cal_dav = max((g2_dav * m_ca_tot) * (g2_dav * m_co3_free), 1e-30)
    iap_gyp_dav = max((g2_dav * m_ca_tot) * (g2_dav * m_so4_tot), 1e-30)
    si_cal_dav = math.log10(iap_cal_dav / ksp_cal)
    si_gyp_dav = math.log10(iap_gyp_dav / ksp_gyp)
    davies_flag = "within_range_I<=0.5" if I_mol <= 0.5 else "invalid_high_ionic_strength_I>0.5"

    return MineralSaturationResult(
        temperature_K=float(T_K),
        pH=pH,
        ionic_strength_molal=float(I_mol),
        water_activity=float(a_w),
        gamma_ca=float(g_ca),
        gamma_co3=float(g_co3),
        gamma_hco3=float(g_hco3),
        gamma_so4=float(g_so4),
        m_ca_free=float(m_ca_free),
        m_co3_free=float(m_co3_free),
        m_hco3_free=float(m_hco3_free),
        m_so4_free=float(m_so4_free),
        iap_calcite=float(iap_cal),
        ksp_calcite=float(ksp_cal),
        omega_calcite=float(omega_cal),
        si_calcite=float(si_cal),
        iap_gypsum=float(iap_gyp),
        ksp_gypsum=float(ksp_gyp),
        omega_gypsum=float(omega_gyp),
        si_gypsum=float(si_gyp),
        davies_si_calcite=float(si_cal_dav),
        davies_si_gypsum=float(si_gyp_dav),
        davies_validity_flag=davies_flag,
        calcite_regime=_classify_regime(si_cal),
        gypsum_regime=_classify_regime(si_gyp),
    )
