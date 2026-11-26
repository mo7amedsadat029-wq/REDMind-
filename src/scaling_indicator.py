"""
Scaling indicator module for RED cell-pair simulation.

Provides one-way coupled geochemical diagnostic post-processing:
Evaluates calcite (CaCO3) saturation ratio (Omega) and Saturation Index (SI)
along the streamwise coordinate at membrane-solution interfaces.

Methodology follows Part F instructions:
- Decoupled / one-way coupled diagnostic post-processing
- Explicitly documented as an exploratory geochemical analysis
- Does not modify verified baseline hydrodynamics or transport
- Focuses on the Cation Exchange Membrane (CEM) where Ca2+ accumulates
  and Anion Exchange Membrane (AEM) where CO3(2-) may accumulate

References:
    Santoro et al. (2021), Energy, 228, 120563.
    Parkhurst & Appelo (2013), USGS PHREEQC.
"""

import numpy as np
from dataclasses import dataclass
from typing import Dict, Any, Optional

from src.geochemistry import evaluate_calcite_saturation, GeochemicalSolution


@dataclass
class InterfaceScalingProfile:
    """Streamwise profiles of scaling indicators at a membrane interface."""
    interface_name: str
    x: np.ndarray
    salinity: np.ndarray         # mol/m^3 local NaCl
    ca_conc: np.ndarray          # mol/m^3 local Ca2+
    alkalinity: np.ndarray       # mol/m^3 local alkalinity
    pH: np.ndarray               # local pH
    ionic_strength: np.ndarray   # mol/L
    gamma_ca: np.ndarray
    gamma_co3: np.ndarray
    omega: np.ndarray            # saturation ratio
    si: np.ndarray               # saturation index log10(Omega)
    max_si: float
    mean_si: float
    is_supersaturated: bool


def compute_scaling_at_interfaces(
    sim_result: Any,
    ca_conc_conc_inlet: float = 10.0,    # mol/m^3 (~400 mg/L Ca2+ in seawater)
    ca_conc_dil_inlet: float = 0.5,      # mol/m^3 (~20 mg/L Ca2+ in river water)
    alk_conc_inlet: float = 2.3,         # mol/m^3 (~140 mg/L HCO3- in seawater)
    alk_dil_inlet: float = 0.8,          # mol/m^3 (~50 mg/L HCO3- in river water)
    pH_conc: float = 8.1,
    pH_dil: float = 7.5,
) -> Dict[str, InterfaceScalingProfile]:
    """
    Compute calcite saturation index along both membrane interfaces.

    CEM Interface:
    - Located at y = h (between concentrated channel bottom and dilute channel top)
    - Receives Ca2+ transport as counter-ions through CEM

    AEM Interface:
    - Located at channel outer boundaries (y = 0 and y = 2h)

    Parameters
    ----------
    sim_result : SimulationResult
        Converged simulation result from reference_simulator
    ca_conc_conc_inlet, ca_conc_dil_inlet : float
        Inlet calcium concentrations in mol/m^3
    alk_conc_inlet, alk_dil_inlet : float
        Inlet carbonate alkalinity in mol/m^3
    pH_conc, pH_dil : float
        Inlet solution pH

    Returns
    -------
    Dict[str, InterfaceScalingProfile]
        Profiles for 'cem_conc_side', 'cem_dil_side', and 'aem_conc_side'
    """
    x = sim_result.geometry.concentrated.x
    nx = len(x)

    # Wall concentrations from simulation
    # In conc channel, bottom wall (j=0) faces CEM, top wall (j=-1) faces AEM
    c_conc_wall_cem = sim_result.c_conc[:, 0]
    c_conc_wall_aem = sim_result.c_conc[:, -1]

    # In dil channel, top wall (j=-1) faces CEM, bottom wall (j=0) faces AEM
    c_dil_wall_cem = sim_result.c_dil[:, -1]
    c_dil_wall_aem = sim_result.c_dil[:, 0]

    # Ratio of local salinity to inlet salinity represents boundary layer concentration polarization
    ratio_conc_cem = c_conc_wall_cem / sim_result.config.c_conc_inlet
    ratio_dil_cem = c_dil_wall_cem / sim_result.config.c_dil_inlet

    # Scale Ca2+ and alkalinity proportionally to local concentration polarization
    ca_cem_conc = ca_conc_conc_inlet * ratio_conc_cem
    alk_cem_conc = alk_conc_inlet * ratio_conc_cem

    ca_cem_dil = ca_conc_dil_inlet * ratio_dil_cem
    alk_cem_dil = alk_dil_inlet * ratio_dil_cem

    # Evaluate along CEM (concentrated side)
    omega_conc = np.zeros(nx)
    si_conc = np.zeros(nx)
    i_str_conc = np.zeros(nx)
    g_ca_conc = np.zeros(nx)
    g_co3_conc = np.zeros(nx)

    for i in range(nx):
        chem = evaluate_calcite_saturation(
            nacl_conc_mol_m3=c_conc_wall_cem[i],
            ca_conc_mol_m3=ca_cem_conc[i],
            alkalinity_mol_m3=alk_cem_conc[i],
            pH=pH_conc,
            temperature_k=sim_result.config.T
        )
        omega_conc[i] = chem.omega
        si_conc[i] = chem.si
        i_str_conc[i] = chem.ionic_strength
        g_ca_conc[i] = chem.gamma_ca
        g_co3_conc[i] = chem.gamma_co3

    cem_conc_profile = InterfaceScalingProfile(
        interface_name="CEM (Concentrated Channel Interface)",
        x=x,
        salinity=c_conc_wall_cem,
        ca_conc=ca_cem_conc,
        alkalinity=alk_cem_conc,
        pH=np.full(nx, pH_conc),
        ionic_strength=i_str_conc,
        gamma_ca=g_ca_conc,
        gamma_co3=g_co3_conc,
        omega=omega_conc,
        si=si_conc,
        max_si=float(np.max(si_conc)),
        mean_si=float(np.mean(si_conc)),
        is_supersaturated=bool(np.max(si_conc) > 0)
    )

    # Evaluate along CEM (dilute side)
    omega_dil = np.zeros(nx)
    si_dil = np.zeros(nx)
    i_str_dil = np.zeros(nx)
    g_ca_dil = np.zeros(nx)
    g_co3_dil = np.zeros(nx)

    for i in range(nx):
        chem = evaluate_calcite_saturation(
            nacl_conc_mol_m3=c_dil_wall_cem[i],
            ca_conc_mol_m3=ca_cem_dil[i],
            alkalinity_mol_m3=alk_cem_dil[i],
            pH=pH_dil,
            temperature_k=sim_result.config.T
        )
        omega_dil[i] = chem.omega
        si_dil[i] = chem.si
        i_str_dil[i] = chem.ionic_strength
        g_ca_dil[i] = chem.gamma_ca
        g_co3_dil[i] = chem.gamma_co3

    cem_dil_profile = InterfaceScalingProfile(
        interface_name="CEM (Dilute Channel Interface)",
        x=x,
        salinity=c_dil_wall_cem,
        ca_conc=ca_cem_dil,
        alkalinity=alk_cem_dil,
        pH=np.full(nx, pH_dil),
        ionic_strength=i_str_dil,
        gamma_ca=g_ca_dil,
        gamma_co3=g_co3_dil,
        omega=omega_dil,
        si=si_dil,
        max_si=float(np.max(si_dil)),
        mean_si=float(np.mean(si_dil)),
        is_supersaturated=bool(np.max(si_dil) > 0)
    )

    return {
        'cem_conc': cem_conc_profile,
        'cem_dil': cem_dil_profile,
    }
