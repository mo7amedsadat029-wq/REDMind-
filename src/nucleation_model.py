"""
Classical Nucleation Theory (CNT) heterogeneous mineral nucleation module for RED membranes.

Implements documented CNT thermodynamics and heterogeneous wetting/roughness physics
following Santoro et al. (2021) and Stumm & Morgan / Sohnel & Mullin, without inventing
uncalibrated crystal-growth kinetics or fabricated membrane permittivity measurements.

Key Distinction (Section 8 & 16):
    - Computes thermodynamic critical nucleus radius r*, homogeneous and heterogeneous
      nucleation energy barriers DeltaG*_hom and DeltaG*_het, wetting factor f(theta_eff),
      and normalized Boltzmann nucleation propensity exp(-DeltaG*_het / kB*T).
    - Does NOT fabricate uncalibrated pre-exponential kinetic factors A_het or deposit
      thickness-vs-time trajectories.
    - Separates physically solved transport + Pitzer thermodynamic states from parametric
      sensitivity sweeps (explicitly labeled as 'Exploratory sensitivity scenario').

References:
    - Santoro, S. et al. (2021), Energy 228, 120563.
    - Sohnel, O. & Mullin, J. W. (1982), J. Colloid Interface Sci. 85, 297.
    - He, S. et al. (1994), J. Colloid Interface Sci. 166, 263 (gypsum interfacial energy).
    - USGS PHREEQC pitzer.dat (mineral molar volumes Vm).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Optional

import numpy as np

KB = 1.380649e-23          # J/K - Boltzmann constant
N_AVOGADRO = 6.02214076e23 # 1/mol
GAS_CONST = 8.31446        # J/(mol*K)

MINERAL_CNT_PROPERTIES: Dict[str, Dict[str, float]] = {
    "Calcite": {
        "Vm_m3_mol": 36.9e-6,      # USGS pitzer.dat line 265
        "gamma_sl_J_m2": 0.094,    # Sohnel & Mullin (1982) midpoint
    },
    "Gypsum": {
        "Vm_m3_mol": 73.9e-6,      # USGS pitzer.dat line 333
        "gamma_sl_J_m2": 0.037,    # He et al. (1994) midpoint
    },
}

# Representative transition threshold for appreciable heterogeneous nucleation rate
# in aqueous precipitation literature (DeltaG*_het / (kB*T) <= ~35-45)
NUCLEATION_BARRIER_THRESHOLD_KBT = 40.0


@dataclass
class HeterogeneousNucleationResult:
    mineral: str
    temperature_K: float
    omega: float
    si: float
    gamma_sl_J_m2: float
    contact_angle_deg: float
    roughness_factor: float
    effective_contact_angle_deg: float
    wetting_factor_f: float
    critical_radius_nm: float
    delta_G_hom_J: float
    delta_G_het_J: float
    barrier_het_kBT: float
    boltzmann_propensity: float
    surface_charge_C_m2_proxy: float
    relative_permittivity: float
    condition_category: str
    classification_tag: str


def wenzel_wetting_factor(contact_angle_deg: float, roughness_factor: float = 1.0) -> tuple[float, float]:
    """
    Compute effective Wenzel contact angle and spherical-cap heterogeneous wetting factor:
        cos(theta_eff) = clip(r * cos(theta), -1, 1)
        f(theta_eff) = (2 + cos(theta_eff)) * (1 - cos(theta_eff))^2 / 4
    """
    cos_t = math.cos(math.radians(contact_angle_deg))
    cos_eff = max(-0.9999, min(0.9999, roughness_factor * cos_t))
    theta_eff_deg = math.degrees(math.acos(cos_eff))
    f_wet = 0.25 * (2.0 + cos_eff) * ((1.0 - cos_eff) ** 2)
    return float(theta_eff_deg), float(f_wet)


def evaluate_heterogeneous_nucleation(
    mineral: str,
    omega: float,
    temperature_K: float = 298.15,
    contact_angle_deg: float = 60.0,
    roughness_factor: float = 1.0,
    gamma_sl_J_m2: Optional[float] = None,
    surface_charge_proxy: float = 0.0,
    relative_permittivity: float = 78.4,
    classification_tag: str = "Thermodynamic post-processing",
) -> HeterogeneousNucleationResult:
    """
    Evaluate Classical Nucleation Theory (CNT) heterogeneous nucleation barrier and
    category assignment (Category A/B/C) for Calcite or Gypsum on a membrane wall.
    """
    props = MINERAL_CNT_PROPERTIES[mineral]
    v_m = props["Vm_m3_mol"] / N_AVOGADRO
    gamma = float(gamma_sl_J_m2 if gamma_sl_J_m2 is not None else props["gamma_sl_J_m2"])
    si = math.log10(max(omega, 1e-30))
    theta_eff_deg, f_wet = wenzel_wetting_factor(contact_angle_deg, roughness_factor)

    if omega <= 1.0:
        r_star_nm = float("inf")
        dG_hom = float("inf")
        dG_het = float("inf")
        barrier_kbt = float("inf")
        propensity = 0.0
        cat = "Category A: Clean membrane" if si < -0.1 else "Category B: Scaling-risk condition"
    else:
        dmu = KB * temperature_K * math.log(omega)
        r_star = 2.0 * gamma * v_m / dmu
        r_star_nm = r_star * 1e9
        dG_hom = (16.0 * math.pi * (gamma ** 3) * (v_m ** 2)) / (3.0 * (dmu ** 2))
        dG_het = f_wet * dG_hom
        barrier_kbt = dG_het / (KB * temperature_K)
        propensity = math.exp(-min(barrier_kbt, 700.0))
        if barrier_kbt <= NUCLEATION_BARRIER_THRESHOLD_KBT:
            cat = "Category C: Nucleation-prone condition"
        else:
            cat = "Category B: Scaling-risk condition"

    return HeterogeneousNucleationResult(
        mineral=mineral,
        temperature_K=float(temperature_K),
        omega=float(omega),
        si=float(si),
        gamma_sl_J_m2=float(gamma),
        contact_angle_deg=float(contact_angle_deg),
        roughness_factor=float(roughness_factor),
        effective_contact_angle_deg=float(theta_eff_deg),
        wetting_factor_f=float(f_wet),
        critical_radius_nm=float(r_star_nm),
        delta_G_hom_J=float(dG_hom),
        delta_G_het_J=float(dG_het),
        barrier_het_kBT=float(barrier_kbt),
        boltzmann_propensity=float(propensity),
        surface_charge_C_m2_proxy=float(surface_charge_proxy),
        relative_permittivity=float(relative_permittivity),
        condition_category=cat,
        classification_tag=classification_tag,
    )
