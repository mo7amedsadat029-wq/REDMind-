"""
Geochemistry module for RED scaling analysis.

Implements aquatic chemistry calculations for the carbonate system and
calcite (CaCO3) thermodynamic saturation index, following:
- Santoro et al. (2021), Energy, 228, 120563
- Parkhurst & Appelo (2013), PHREEQC Version 3, USGS
- Stumm & Morgan (1996), Aquatic Chemistry

Thermodynamic equilibrium:
    CaCO3(s) <=> Ca2+ + CO3(2-)
    Ksp = {Ca2+} * {CO3(2-)} = gamma_Ca * [Ca2+] * gamma_CO3 * [CO3(2-)]

Saturation ratio:
    Omega = IAP / Ksp

Saturation Index:
    SI = log10(Omega)
    SI > 0: Supersaturated (thermodynamic potential for precipitation)
    SI = 0: Equilibrium
    SI < 0: Undersaturated (dissolution favored)

Activity coefficients:
    Davies equation (valid for I up to ~0.5 mol/kg):
    log10(gamma_i) = -A * z_i^2 * (sqrt(I) / (1 + sqrt(I)) - 0.3 * I)
"""

import numpy as np
from dataclasses import dataclass
from typing import Tuple, Dict, Any


# Standard equilibrium constants at 298.15 K (25 °C)
# From USGS PHREEQC phreeqc.dat database
LOG10_KSP_CALCITE_25C = -8.480    # CaCO3(calcite) <=> Ca2+ + CO3(2-)
LOG10_K1_CARBONIC_25C = -6.352    # CO2(aq) + H2O <=> H+ + HCO3-
LOG10_K2_CARBONIC_25C = -10.329   # HCO3- <=> H+ + CO3(2-)
LOG10_KW_WATER_25C    = -13.997   # H2O <=> H+ + OH-

# Debye-Huckel constant A at 25 °C (in (kg/mol)^0.5)
A_DEBYE_HUCKEL = 0.5092


@dataclass
class GeochemicalSolution:
    """Chemical state of an aqueous solution."""
    pH: float
    temperature_k: float
    ionic_strength: float        # mol/kg or mol/L (M)
    ca_total: float              # mol/m^3 (total dissolved calcium)
    alkalinity: float            # mol/m^3 (total carbonate alkalinity as HCO3-)
    gamma_ca: float              # activity coefficient for Ca2+
    gamma_co3: float             # activity coefficient for CO3(2-)
    co3_concentration: float     # mol/m^3 free CO3(2-)
    iap: float                   # ion activity product (mol/kg)^2
    ksp: float                   # solubility product
    omega: float                 # saturation ratio
    si: float                    # saturation index log10(Omega)


def calculate_activity_coefficient_davies(z: int, ionic_strength: float) -> float:
    """
    Compute single-ion activity coefficient using the Davies equation.

    log10(gamma) = -A * z^2 * (sqrt(I) / (1 + sqrt(I)) - 0.3 * I)

    Parameters
    ----------
    z : int
        Ionic charge number (+2 for Ca2+, -2 for CO3(2-))
    ionic_strength : float
        Ionic strength in mol/L or mol/kg (I >= 0)

    Returns
    -------
    float
        Activity coefficient gamma
    """
    if ionic_strength <= 1e-12:
        return 1.0

    sqrt_I = np.sqrt(ionic_strength)
    log_gamma = -A_DEBYE_HUCKEL * (z**2) * (sqrt_I / (1.0 + sqrt_I) - 0.3 * ionic_strength)
    return float(10.0**log_gamma)


def calculate_carbonate_species(
    pH: float,
    alkalinity_mol_m3: float,
    temperature_k: float = 298.15
) -> Tuple[float, float, float]:
    """
    Compute free carbonate (CO3 2-) concentration from pH and alkalinity.

    At circumneutral to alkaline pH (7 < pH < 9), alkalinity is dominated by:
        Alk ~= [HCO3-] + 2*[CO3(2-)]

    Using [CO3(2-)] = K2 * [HCO3-] / [H+]:
        Alk = [HCO3-] * (1 + 2 * K2 / [H+])
        [HCO3-] = Alk / (1 + 2 * K2 / [H+])
        [CO3(2-)] = K2 * [HCO3-] / [H+]

    Parameters
    ----------
    pH : float
        Solution pH
    alkalinity_mol_m3 : float
        Carbonate alkalinity in mol/m^3
    temperature_k : float
        Absolute temperature (K)

    Returns
    -------
    Tuple[float, float, float]
        (hco3_conc, co3_conc, h_conc) in mol/m^3
    """
    # H+ concentration in mol/L (M)
    h_molar = 10.0**(-pH)
    h_mol_m3 = h_molar * 1000.0  # mol/m^3

    k2 = 10.0**LOG10_K2_CARBONIC_25C

    alpha2 = k2 / (h_molar + 2.0 * k2)
    co3_mol_m3 = alkalinity_mol_m3 * alpha2
    hco3_mol_m3 = alkalinity_mol_m3 - 2.0 * co3_mol_m3

    return max(hco3_mol_m3, 0.0), max(co3_mol_m3, 0.0), h_mol_m3


def evaluate_calcite_saturation(
    nacl_conc_mol_m3: float,
    ca_conc_mol_m3: float,
    alkalinity_mol_m3: float,
    pH: float = 8.1,
    temperature_k: float = 298.15
) -> GeochemicalSolution:
    """
    Compute calcite saturation ratio (Omega) and saturation index (SI).

    Parameters
    ----------
    nacl_conc_mol_m3 : float
        Background NaCl salinity (mol/m^3). Controls ionic strength.
    ca_conc_mol_m3 : float
        Dissolved Ca2+ concentration (mol/m^3). Typically ~10 mol/m^3 in seawater.
    alkalinity_mol_m3 : float
        Alkalinity (mol/m^3). Typically ~2.3 mol/m^3 in seawater.
    pH : float
        Solution pH (default 8.1 for seawater)
    temperature_k : float
        Temperature in Kelvin (default 298.15 K)

    Returns
    -------
    GeochemicalSolution
        Comprehensive geochemical output containing SI and species states.
    """
    # 1. Ionic strength: I = 0.5 * sum(z_i^2 * c_i) in mol/L
    # Major ions: Na+ (~c_nacl), Cl- (~c_nacl), Ca2+ (z=2), CO3(2-) (z=2)
    # Convert mol/m^3 to mol/L (divided by 1000)
    c_na_M = nacl_conc_mol_m3 / 1000.0
    c_cl_M = nacl_conc_mol_m3 / 1000.0
    c_ca_M = ca_conc_mol_m3 / 1000.0

    # Carbonate speciation
    hco3_m3, co3_m3, _ = calculate_carbonate_species(pH, alkalinity_mol_m3, temperature_k)
    c_co3_M = co3_m3 / 1000.0
    c_hco3_M = hco3_m3 / 1000.0

    ionic_strength = 0.5 * (
        (1.0**2) * c_na_M +
        (1.0**2) * c_cl_M +
        (2.0**2) * c_ca_M +
        (1.0**2) * c_hco3_M +
        (2.0**2) * c_co3_M
    )

    # 2. Activity coefficients (Davies model for divalent ions)
    gamma_ca = calculate_activity_coefficient_davies(z=2, ionic_strength=ionic_strength)
    gamma_co3 = calculate_activity_coefficient_davies(z=2, ionic_strength=ionic_strength)

    # 3. Activities: {i} = gamma_i * m_i (m_i approx c_i in mol/L for dilute to seawater)
    act_ca = gamma_ca * c_ca_M
    act_co3 = gamma_co3 * c_co3_M

    iap = act_ca * act_co3

    # 4. Thermodynamic Ksp
    ksp = 10.0**LOG10_KSP_CALCITE_25C

    # 5. Saturation ratio and Index
    omega = iap / max(ksp, 1e-30)
    si = float(np.log10(max(omega, 1e-30)))

    return GeochemicalSolution(
        pH=pH,
        temperature_k=temperature_k,
        ionic_strength=ionic_strength,
        ca_total=ca_conc_mol_m3,
        alkalinity=alkalinity_mol_m3,
        gamma_ca=gamma_ca,
        gamma_co3=gamma_co3,
        co3_concentration=co3_m3,
        iap=iap,
        ksp=ksp,
        omega=omega,
        si=si
    )
