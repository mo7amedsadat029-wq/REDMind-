"""
Membrane interface conditions for RED cell-pair simulation.

Implements Donnan equilibrium at membrane-solution interfaces and
membrane transport for ion-exchange membranes (IEMs).

Physics:
    At each membrane-solution interface, the Donnan equilibrium relates
    the concentrations and potential across the interface:

    ΔΦ_Donnan = -(RT)/(z_i * F) * ln(c_i^mem / c_i^sol)

    For a 1:1 electrolyte (NaCl) with local electroneutrality in the
    membrane phase:

    CEM (fixed charge X < 0, cation-selective):
        c_Na^mem = -X/2 + sqrt((X/2)² + c_sol²)   [counter-ion]
        c_Cl^mem = +X/2 + sqrt((X/2)² + c_sol²)    [co-ion]

    AEM (fixed charge X > 0, anion-selective):
        c_Cl^mem = +X/2 + sqrt((X/2)² + c_sol²)   [counter-ion]
        c_Na^mem = -X/2 + sqrt((X/2)² + c_sol²)    [co-ion]

    Permselectivity:
        α = X / (X + 2*c_co^mem)   [ideal Donnan-based]

    Membrane resistance (simplified):
        r_m = δ_m / σ_m

    where δ_m = membrane thickness, σ_m = membrane conductivity.

    Alternatively, membrane resistance from ion concentrations:
        σ_m = F² / (RT) * Σ(z_i² * D_i^mem * c_i^mem)

References:
    Gurreri et al. (2017), Desalination, 423, 52-64.
    Tedesco et al. (2016), J. Membrane Science, 510, 370-381.
"""

import numpy as np
from dataclasses import dataclass
from typing import Tuple, Optional


# Physical constants
FARADAY = 96485.3329    # C/mol
GAS_CONST = 8.31446     # J/(mol·K)


@dataclass
class MembraneProperties:
    """Properties of an ion-exchange membrane."""
    membrane_type: str          # 'CEM' or 'AEM'
    thickness: float            # m
    fixed_charge_density: float # mol/m³ (positive for AEM, negative for CEM)
    D_counter: float            # m²/s - counter-ion diffusivity in membrane
    D_co: float                 # m²/s - co-ion diffusivity in membrane
    areal_resistance: Optional[float] = None  # Ω·m² (if known directly)

    def __post_init__(self):
        if self.membrane_type == 'CEM':
            assert self.fixed_charge_density < 0, \
                "CEM fixed charge must be negative"
        elif self.membrane_type == 'AEM':
            assert self.fixed_charge_density > 0, \
                "AEM fixed charge must be positive"


@dataclass
class DonnanEquilibrium:
    """Results of Donnan equilibrium calculation at an interface."""
    c_na_sol: float     # Na+ in solution at interface (mol/m³)
    c_cl_sol: float     # Cl- in solution at interface (mol/m³)
    c_na_mem: float     # Na+ in membrane at interface (mol/m³)
    c_cl_mem: float     # Cl- in membrane at interface (mol/m³)
    phi_donnan: float   # Donnan potential jump (V), solution → membrane
    permselectivity: float  # local permselectivity


def donnan_equilibrium_1to1(
    c_sol: float,
    X_fix: float,
    T: float = 298.15
) -> DonnanEquilibrium:
    """
    Calculate Donnan equilibrium for 1:1 electrolyte at membrane-solution interface.

    For NaCl with electroneutrality in solution (c_Na = c_Cl = c_sol)
    and in the membrane (c_Na^m - c_Cl^m + X_fix = 0 for CEM where X_fix < 0):

    Using the Donnan partition coefficient:
        c_Na^m * c_Cl^m = c_sol²   (Donnan product, ideal activities)

    Combined with membrane electroneutrality:
        c_Na^m = c_Cl^m - X_fix    (for CEM, X_fix < 0 → c_Na^m > c_Cl^m)
        c_Cl^m = c_Na^m - X_fix    (for AEM, X_fix > 0 → c_Cl^m > c_Na^m)

    Parameters
    ----------
    c_sol : float
        Salt concentration in solution at the interface (mol/m³)
    X_fix : float
        Fixed charge density (mol/m³). Negative for CEM, positive for AEM.
    T : float
        Temperature (K)

    Returns
    -------
    DonnanEquilibrium
        Donnan equilibrium results
    """
    abs_X = abs(X_fix)

    # Membrane concentrations from electroneutrality + Donnan product
    # For CEM (X_fix < 0): membrane has excess cations
    #   c_Na = -X_fix/2 + sqrt((X_fix/2)² + c_sol²)
    #   c_Cl = +X_fix/2 + sqrt((X_fix/2)² + c_sol²)
    # For AEM (X_fix > 0): membrane has excess anions
    #   c_Cl = +X_fix/2 + sqrt((X_fix/2)² + c_sol²)
    #   c_Na = -X_fix/2 + sqrt((X_fix/2)² + c_sol²)

    discriminant = (X_fix / 2.0)**2 + c_sol**2
    sqrt_disc = np.sqrt(discriminant)

    if X_fix < 0:  # CEM
        c_na_mem = -X_fix / 2.0 + sqrt_disc  # counter-ion (large)
        c_cl_mem = X_fix / 2.0 + sqrt_disc     # co-ion (small)
    else:  # AEM
        c_cl_mem = X_fix / 2.0 + sqrt_disc    # counter-ion (large)
        c_na_mem = -X_fix / 2.0 + sqrt_disc    # co-ion (small)

    # Ensure positive concentrations
    c_na_mem = max(c_na_mem, 1e-10)
    c_cl_mem = max(c_cl_mem, 1e-10)

    # Donnan potential: ΔΦ = -(RT/F) * ln(c_Na^mem / c_Na^sol)
    # (using Na+ with z=+1)
    phi_donnan = -(GAS_CONST * T / FARADAY) * np.log(c_na_mem / max(c_sol, 1e-10))

    # Permselectivity (Donnan-based)
    # For CEM: α = |X_fix| / (|X_fix| + 2*c_co)  where c_co = c_Cl^mem
    # For AEM: α = |X_fix| / (|X_fix| + 2*c_co)  where c_co = c_Na^mem
    if X_fix < 0:  # CEM
        c_co = c_cl_mem
    else:  # AEM
        c_co = c_na_mem

    permselectivity = abs_X / (abs_X + 2.0 * c_co)

    return DonnanEquilibrium(
        c_na_sol=c_sol,
        c_cl_sol=c_sol,
        c_na_mem=c_na_mem,
        c_cl_mem=c_cl_mem,
        phi_donnan=phi_donnan,
        permselectivity=permselectivity
    )


def membrane_potential_nernst(
    c_conc: float,
    c_dil: float,
    alpha: float,
    T: float = 298.15
) -> float:
    """
    Calculate the membrane potential (EMF) for one membrane.

    For an ideal 1:1 electrolyte:
        E_m = α * (RT/F) * ln(c_conc / c_dil)

    Parameters
    ----------
    c_conc : float
        Concentration on concentrated side (mol/m³)
    c_dil : float
        Concentration on dilute side (mol/m³)
    alpha : float
        Apparent permselectivity
    T : float
        Temperature (K)

    Returns
    -------
    float
        Membrane potential (V)
    """
    return alpha * (GAS_CONST * T / FARADAY) * np.log(c_conc / max(c_dil, 1e-10))


def cell_pair_ocv(
    c_conc: float,
    c_dil: float,
    alpha_cem: float,
    alpha_aem: float,
    T: float = 298.15
) -> float:
    """
    Calculate open-circuit voltage per cell pair.

    E_OCV = (α_CEM + α_AEM) * (RT/F) * ln(c_conc / c_dil)

    For ideal (α=1) membranes with c_conc = 500 mol/m³, c_dil = 17 mol/m³:
    E_OCV ≈ 2 * 0.02569 * ln(500/17) ≈ 0.173 V

    Parameters
    ----------
    c_conc : float
        Concentrated stream concentration (mol/m³)
    c_dil : float
        Dilute stream concentration (mol/m³)
    alpha_cem, alpha_aem : float
        Permselectivities of CEM and AEM
    T : float
        Temperature (K)

    Returns
    -------
    float
        Open-circuit voltage (V)
    """
    return (alpha_cem + alpha_aem) * (GAS_CONST * T / FARADAY) * \
           np.log(c_conc / max(c_dil, 1e-10))


def membrane_salt_flux(
    c_sol_high: float,
    c_sol_low: float,
    mem_props: MembraneProperties,
    T: float = 298.15
) -> float:
    """
    Calculate trans-membrane salt flux through a single membrane.

    Simplified 1D steady-state Nernst-Planck through the membrane:

    For a binary electrolyte, the net salt flux is approximately:
        J_salt ≈ D_eff^mem * (c_m_high - c_m_low) / δ_m

    where c_m_high, c_m_low are the membrane-side concentrations
    obtained from Donnan equilibrium, and D_eff^mem is the effective
    salt diffusivity in the membrane.

    Parameters
    ----------
    c_sol_high : float
        Solution concentration on high side (mol/m³)
    c_sol_low : float
        Solution concentration on low side (mol/m³)
    mem_props : MembraneProperties
        Membrane properties
    T : float
        Temperature (K)

    Returns
    -------
    float
        Salt flux through membrane (mol/(m²·s)), positive from high to low
    """
    # Donnan equilibrium on both sides
    don_high = donnan_equilibrium_1to1(c_sol_high, mem_props.fixed_charge_density, T)
    don_low = donnan_equilibrium_1to1(c_sol_low, mem_props.fixed_charge_density, T)

    # Effective membrane salt diffusivity
    # For the ambipolar case in the membrane
    D_eff_mem = 2.0 * mem_props.D_counter * mem_props.D_co / \
                (mem_props.D_counter + mem_props.D_co)

    # Use the average of counter-ion concentrations (which dominate)
    # The salt flux is driven by the co-ion gradient
    if mem_props.fixed_charge_density < 0:  # CEM
        # Salt transport limited by co-ion (Cl-) gradient
        dc_co = don_high.c_cl_mem - don_low.c_cl_mem
    else:  # AEM
        # Salt transport limited by co-ion (Na+) gradient
        dc_co = don_high.c_na_mem - don_low.c_na_mem

    # Approximate salt flux
    J_salt = D_eff_mem * dc_co / mem_props.thickness

    return J_salt


def compute_membrane_interface_profiles(
    c_conc_wall: np.ndarray,
    c_dil_wall: np.ndarray,
    x: np.ndarray,
    X_fix_cem: float,
    X_fix_aem: float,
    T: float = 298.15
) -> dict:
    """
    Compute Donnan equilibrium along the membrane interfaces.

    Parameters
    ----------
    c_conc_wall : np.ndarray
        Concentration at concentrated-channel wall (membrane surface) [nx]
    c_dil_wall : np.ndarray
        Concentration at dilute-channel wall (membrane surface) [nx]
    x : np.ndarray
        Streamwise coordinates [nx]
    X_fix_cem : float
        CEM fixed charge density (mol/m³, negative)
    X_fix_aem : float
        AEM fixed charge density (mol/m³, positive)
    T : float
        Temperature (K)

    Returns
    -------
    dict
        Dictionary with membrane-interface profiles
    """
    nx = len(x)

    results = {
        'x': x,
        'cem': {
            'c_na_mem_conc': np.zeros(nx),
            'c_cl_mem_conc': np.zeros(nx),
            'c_na_mem_dil': np.zeros(nx),
            'c_cl_mem_dil': np.zeros(nx),
            'phi_donnan_conc': np.zeros(nx),
            'phi_donnan_dil': np.zeros(nx),
            'permselectivity_conc': np.zeros(nx),
            'permselectivity_dil': np.zeros(nx),
            'E_membrane': np.zeros(nx),
        },
        'aem': {
            'c_na_mem_conc': np.zeros(nx),
            'c_cl_mem_conc': np.zeros(nx),
            'c_na_mem_dil': np.zeros(nx),
            'c_cl_mem_dil': np.zeros(nx),
            'phi_donnan_conc': np.zeros(nx),
            'phi_donnan_dil': np.zeros(nx),
            'permselectivity_conc': np.zeros(nx),
            'permselectivity_dil': np.zeros(nx),
            'E_membrane': np.zeros(nx),
        },
    }

    for i in range(nx):
        # CEM: between concentrated (top side) and dilute (bottom side)
        don_cem_conc = donnan_equilibrium_1to1(c_conc_wall[i], X_fix_cem, T)
        don_cem_dil = donnan_equilibrium_1to1(c_dil_wall[i], X_fix_cem, T)

        results['cem']['c_na_mem_conc'][i] = don_cem_conc.c_na_mem
        results['cem']['c_cl_mem_conc'][i] = don_cem_conc.c_cl_mem
        results['cem']['c_na_mem_dil'][i] = don_cem_dil.c_na_mem
        results['cem']['c_cl_mem_dil'][i] = don_cem_dil.c_cl_mem
        results['cem']['phi_donnan_conc'][i] = don_cem_conc.phi_donnan
        results['cem']['phi_donnan_dil'][i] = don_cem_dil.phi_donnan
        results['cem']['permselectivity_conc'][i] = don_cem_conc.permselectivity
        results['cem']['permselectivity_dil'][i] = don_cem_dil.permselectivity

        # CEM membrane potential (local)
        alpha_cem = 0.5 * (don_cem_conc.permselectivity + don_cem_dil.permselectivity)
        results['cem']['E_membrane'][i] = membrane_potential_nernst(
            c_conc_wall[i], c_dil_wall[i], alpha_cem, T
        )

        # AEM: similar but with positive fixed charge
        don_aem_conc = donnan_equilibrium_1to1(c_conc_wall[i], X_fix_aem, T)
        don_aem_dil = donnan_equilibrium_1to1(c_dil_wall[i], X_fix_aem, T)

        results['aem']['c_na_mem_conc'][i] = don_aem_conc.c_na_mem
        results['aem']['c_cl_mem_conc'][i] = don_aem_conc.c_cl_mem
        results['aem']['c_na_mem_dil'][i] = don_aem_dil.c_na_mem
        results['aem']['c_cl_mem_dil'][i] = don_aem_dil.c_cl_mem
        results['aem']['phi_donnan_conc'][i] = don_aem_conc.phi_donnan
        results['aem']['phi_donnan_dil'][i] = don_aem_dil.phi_donnan
        results['aem']['permselectivity_conc'][i] = don_aem_conc.permselectivity
        results['aem']['permselectivity_dil'][i] = don_aem_dil.permselectivity

        alpha_aem = 0.5 * (don_aem_conc.permselectivity + don_aem_dil.permselectivity)
        results['aem']['E_membrane'][i] = membrane_potential_nernst(
            c_conc_wall[i], c_dil_wall[i], alpha_aem, T
        )

    # Total cell-pair OCV profile
    results['E_cell_pair'] = results['cem']['E_membrane'] + results['aem']['E_membrane']

    return results
