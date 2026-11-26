"""
Electrical model for RED cell-pair and stack performance.

Implements the Thevenin-equivalent circuit model for RED:
    V_cell = E_OCV - I * R_internal

Stack-level calculations following Long et al. (2018):
    E_stack = N * E_cell
    R_stack = N * R_cell + R_electrode

Power calculations:
    P_gross = I * V_load = I² * R_load
    P_pump = ΔP_HC * Q_HC / η_pump + ΔP_LC * Q_LC / η_pump
    P_net = P_gross - P_pump

Maximum gross power (matched load):
    P_max = E_OCV² / (4 * R_internal)

References:
    Long et al. (2018), Energy, 158, 427-436.
    Gurreri et al. (2017), Desalination, 423, 52-64.
"""

import numpy as np
from dataclasses import dataclass
from typing import Optional, Tuple

# Physical constants
FARADAY = 96485.3329
GAS_CONST = 8.31446


@dataclass
class ElectricalResult:
    """Container for electrical performance results."""
    E_ocv: float              # Open-circuit voltage (V)
    R_internal: float         # Total internal resistance (Ω·m²)
    R_conc: float             # Concentrated channel resistance (Ω·m²)
    R_dil: float              # Dilute channel resistance (Ω·m²)
    R_cem: float              # CEM resistance (Ω·m²)
    R_aem: float              # AEM resistance (Ω·m²)
    I_max_power: float        # Current at max power (A/m²)
    V_max_power: float        # Voltage at max power (V)
    P_gross_max: float        # Maximum gross power density (W/m²)
    P_pump_conc: float        # Pumping power conc channel (W/m²)
    P_pump_dil: float         # Pumping power dil channel (W/m²)
    P_pump_total: float       # Total pumping power (W/m²)
    P_net_max: float          # Maximum net power density (W/m²)
    alpha_cem: float          # CEM permselectivity used
    alpha_aem: float          # AEM permselectivity used


def solution_conductivity_nacl(
    c: float,
    T: float = 298.15,
    D_na: float = 1.334e-9,
    D_cl: float = 2.032e-9,
) -> float:
    """
    Estimate NaCl solution conductivity from concentration.

    Uses a simplified Kohlrausch-type relation for dilute solutions
    and empirical fit for moderate concentrations.

    σ = F² / (RT) * (D_Na * c_Na + D_Cl * c_Cl)
      = F² / (RT) * (D_Na + D_Cl) * c     [for 1:1 electrolyte]

    This is the infinite-dilution limiting conductivity approach.
    For more concentrated solutions, a correction should be applied.

    Parameters
    ----------
    c : float
        NaCl concentration (mol/m³)
    T : float
        Temperature (K)
    D_na, D_cl : float
        Ion diffusion coefficients (m²/s)

    Returns
    -------
    float
        Conductivity (S/m)
    """
    # Nernst-Einstein relation for conductivity
    sigma = FARADAY**2 / (GAS_CONST * T) * (D_na + D_cl) * c

    return sigma


def channel_resistance(
    c_avg: float,
    channel_height: float,
    T: float = 298.15,
    D_na: float = 1.334e-9,
    D_cl: float = 2.032e-9,
) -> float:
    """
    Calculate areal resistance of a solution channel.

    R_ch = h / σ    (Ω·m²)

    where h = channel height (m), σ = solution conductivity (S/m).

    Parameters
    ----------
    c_avg : float
        Average NaCl concentration in channel (mol/m³)
    channel_height : float
        Channel height (m)
    T : float
        Temperature (K)
    D_na, D_cl : float
        Ion diffusion coefficients (m²/s)

    Returns
    -------
    float
        Areal resistance (Ω·m²)
    """
    sigma = solution_conductivity_nacl(c_avg, T, D_na=D_na, D_cl=D_cl)
    return channel_height / max(sigma, 1e-10)


def membrane_resistance(
    thickness: float,
    sigma_m: float
) -> float:
    """
    Calculate areal resistance of a membrane.

    R_m = δ_m / σ_m   (Ω·m²)

    Parameters
    ----------
    thickness : float
        Membrane thickness (m)
    sigma_m : float
        Membrane conductivity (S/m)

    Returns
    -------
    float
        Areal resistance (Ω·m²)
    """
    return thickness / max(sigma_m, 1e-10)


def compute_cell_pair_performance(
    c_conc_avg: float,
    c_dil_avg: float,
    channel_height: float,
    membrane_thickness_cem: float,
    membrane_thickness_aem: float,
    sigma_cem: float,
    sigma_aem: float,
    alpha_cem: float,
    alpha_aem: float,
    delta_p_conc: float,
    delta_p_dil: float,
    u_mean_conc: float,
    u_mean_dil: float,
    eta_pump: float = 0.75,
    T: float = 298.15,
    channel_length: float = 0.10,
    D_na: float = 1.334e-9,
    D_cl: float = 2.032e-9,
) -> ElectricalResult:
    """
    Compute electrical performance of a single cell pair.

    Parameters
    ----------
    c_conc_avg : float
        Average concentration in concentrated channel (mol/m³)
    c_dil_avg : float
        Average concentration in dilute channel (mol/m³)
    channel_height : float
        Channel height (m) - same for both channels
    membrane_thickness_cem, membrane_thickness_aem : float
        Membrane thicknesses (m)
    sigma_cem, sigma_aem : float
        Membrane conductivities (S/m)
    alpha_cem, alpha_aem : float
        Membrane permselectivities
    delta_p_conc, delta_p_dil : float
        Pressure drops (Pa)
    u_mean_conc, u_mean_dil : float
        Mean flow velocities (m/s)
    eta_pump : float
        Pump efficiency
    T : float
        Temperature (K)
    channel_length : float
        Channel length (m)
    D_na, D_cl : float
        Ion diffusion coefficients (m²/s)

    Returns
    -------
    ElectricalResult
        Complete electrical performance
    """
    # Open-circuit voltage
    E_ocv = (alpha_cem + alpha_aem) * (GAS_CONST * T / FARADAY) * \
            np.log(c_conc_avg / max(c_dil_avg, 1e-10))

    # Internal resistances (areal, per cell pair)
    R_conc = channel_resistance(c_conc_avg, channel_height, T, D_na=D_na, D_cl=D_cl)
    R_dil = channel_resistance(c_dil_avg, channel_height, T, D_na=D_na, D_cl=D_cl)
    R_cem = membrane_resistance(membrane_thickness_cem, sigma_cem)
    R_aem = membrane_resistance(membrane_thickness_aem, sigma_aem)
    R_internal = R_conc + R_dil + R_cem + R_aem

    # Maximum gross power at matched load (R_load = R_internal)
    I_max = E_ocv / (2.0 * R_internal)       # A/m²
    V_max = E_ocv / 2.0                      # V
    P_gross_max = E_ocv**2 / (4.0 * R_internal)  # W/m²

    # Pumping power (per unit membrane area)
    # Q = u_mean * h * W, where W = width
    # P_pump = ΔP * Q / η = ΔP * u_mean * h / η per unit width
    # Per unit membrane area (A = L * W): P_pump/A = ΔP * u_mean * h / (η * L)
    # But for 2D: power per unit membrane area
    P_pump_conc = delta_p_conc * u_mean_conc * channel_height / \
                  (eta_pump * channel_length)
    P_pump_dil = delta_p_dil * u_mean_dil * channel_height / \
                 (eta_pump * channel_length)
    P_pump_total = P_pump_conc + P_pump_dil

    P_net_max = P_gross_max - P_pump_total

    return ElectricalResult(
        E_ocv=E_ocv,
        R_internal=R_internal,
        R_conc=R_conc,
        R_dil=R_dil,
        R_cem=R_cem,
        R_aem=R_aem,
        I_max_power=I_max,
        V_max_power=V_max,
        P_gross_max=P_gross_max,
        P_pump_conc=P_pump_conc,
        P_pump_dil=P_pump_dil,
        P_pump_total=P_pump_total,
        P_net_max=P_net_max,
        alpha_cem=alpha_cem,
        alpha_aem=alpha_aem
    )


def polarization_curve(
    E_ocv: float,
    R_internal: float,
    n_points: int = 50
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Generate the polarization curve (V-I) and power curve (P-I).

    V = E_OCV - I * R_internal
    P = I * V = I * (E_OCV - I * R_internal)

    Parameters
    ----------
    E_ocv : float
        Open-circuit voltage (V)
    R_internal : float
        Internal resistance (Ω·m²)
    n_points : int
        Number of points

    Returns
    -------
    Tuple[np.ndarray, np.ndarray, np.ndarray]
        (current_density [A/m²], voltage [V], power_density [W/m²])
    """
    I_max = E_ocv / R_internal  # short-circuit current
    I = np.linspace(0, I_max, n_points)
    V = E_ocv - I * R_internal
    P = I * V

    return I, V, P
