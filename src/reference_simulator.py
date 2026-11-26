"""
Reference simulator for 2D RED cell pair.

This is the main simulation module that couples:
1. Flow solver (Poiseuille flow in each channel)
2. Ion transport (Nernst-Planck with electroneutrality)
3. Membrane interfaces (Donnan equilibrium)
4. Electrical model (Thevenin equivalent)

The coupling approach:
    - Flow is solved analytically (Poiseuille) for each channel independently
    - Ion transport is solved iteratively:
        a. Initialize concentration fields
        b. Compute membrane-interface concentrations using Donnan equilibrium
        c. Calculate trans-membrane salt flux
        d. Solve advection-diffusion in each channel with flux BCs
        e. Update interface concentrations
        f. Repeat until convergence
    - Electrical performance is computed from converged fields

The iterative coupling between channels through the membrane is necessary
because the trans-membrane flux depends on both wall concentrations, which
in turn depend on the flux boundary conditions.

References:
    Gurreri et al. (2017), Desalination, 423, 52-64.
"""

import numpy as np
import time
import sys
from dataclasses import dataclass, field
from typing import Optional, Tuple, Dict, Any

from src.geometry import CellPairGeometry
from src.flow_solver import (
    analytical_poiseuille_2d, compute_cell_pair_flow,
    FlowSolution, verify_poiseuille_mass_conservation,
    pumping_power_per_unit_width
)
from src.ion_transport import (
    solve_advection_diffusion_2d, compute_electric_potential,
    compute_diffusive_flux, check_mass_balance,
    ambipolar_diffusivity, TransportSolution, FARADAY, GAS_CONST
)
from src.membrane_interfaces import (
    MembraneProperties, DonnanEquilibrium,
    donnan_equilibrium_1to1, membrane_salt_flux,
    compute_membrane_interface_profiles, cell_pair_ocv
)
from src.electrical_model import (
    compute_cell_pair_performance, ElectricalResult,
    polarization_curve, solution_conductivity_nacl
)


@dataclass
class SimulationConfig:
    """Complete configuration for a RED cell-pair simulation."""
    # Geometry
    channel_height: float = 270e-6      # m
    channel_length: float = 0.10        # m
    membrane_thickness_cem: float = 125e-6  # m
    membrane_thickness_aem: float = 125e-6  # m

    # Mesh
    nx: int = 100
    ny: int = 30

    # Flow
    u_mean_conc: float = 0.01    # m/s
    u_mean_dil: float = 0.01     # m/s

    # Feed
    c_conc_inlet: float = 500.0   # mol/m³ (0.5 M)
    c_dil_inlet: float = 17.0     # mol/m³ (0.017 M)

    # Ion properties
    D_na: float = 1.334e-9    # m²/s
    D_cl: float = 2.032e-9    # m²/s

    # Fluid properties
    rho: float = 997.0        # kg/m³
    mu: float = 8.9e-4        # Pa·s

    # Temperature
    T: float = 298.15         # K

    # Membrane properties
    X_cem: float = -2000.0    # mol/m³ (fixed charge, negative for CEM)
    X_aem: float = 2000.0     # mol/m³ (fixed charge, positive for AEM)
    D_counter_cem: float = 1e-11   # m²/s (Na+ in CEM)
    D_co_cem: float = 1e-12        # m²/s (Cl- in CEM)
    D_counter_aem: float = 1e-11   # m²/s (Cl- in AEM)
    D_co_aem: float = 1e-12        # m²/s (Na+ in AEM)
    sigma_cem: float = 1.0    # S/m
    sigma_aem: float = 1.0    # S/m

    # Solver
    max_coupling_iter: int = 50
    coupling_tol: float = 1e-4
    relaxation: float = 0.3

    # Pump
    eta_pump: float = 0.75

    # Load / Current operating condition (0.0 = open-circuit, 0.5 = matched load)
    load_fraction: float = 0.0
    current_density: Optional[float] = None  # A/m² (overrides load_fraction if set)
    temperature_dependent_properties: bool = True

    # Case ID
    case_id: str = "reference"

    @property
    def mu_eff(self) -> float:
        """Dynamic viscosity adjusted for temperature via Vogel scaling (exact at 298.15 K)."""
        if not self.temperature_dependent_properties or abs(self.T - 298.15) < 1e-9:
            return self.mu
        B_vogel = 578.919
        C_vogel = 137.546
        return float(self.mu * np.exp(
            B_vogel * (1.0 / (self.T - C_vogel) - 1.0 / (298.15 - C_vogel))
        ))

    @property
    def D_na_eff(self) -> float:
        """Na+ diffusivity scaled by Stokes-Einstein T/mu (exact at 298.15 K)."""
        if not self.temperature_dependent_properties or abs(self.T - 298.15) < 1e-9:
            return self.D_na
        return float(self.D_na * (self.T / 298.15) * (self.mu / self.mu_eff))

    @property
    def D_cl_eff(self) -> float:
        """Cl- diffusivity scaled by Stokes-Einstein T/mu (exact at 298.15 K)."""
        if not self.temperature_dependent_properties or abs(self.T - 298.15) < 1e-9:
            return self.D_cl
        return float(self.D_cl * (self.T / 298.15) * (self.mu / self.mu_eff))

    @property
    def D_eff(self):
        return ambipolar_diffusivity(self.D_na_eff, self.D_cl_eff)


@dataclass
class SimulationResult:
    """Complete results from a RED cell-pair simulation."""
    config: SimulationConfig
    geometry: CellPairGeometry
    flow_conc: FlowSolution
    flow_dil: FlowSolution
    c_conc: np.ndarray          # concentration in conc channel [nx, ny]
    c_dil: np.ndarray           # concentration in dil channel [nx, ny]
    phi_conc: np.ndarray        # potential in conc channel [nx, ny]
    phi_dil: np.ndarray         # potential in dil channel [nx, ny]
    membrane_profiles: dict     # membrane interface profiles
    electrical: ElectricalResult
    convergence_history: list
    coupling_iterations: int
    converged: bool
    wall_time_seconds: float
    mass_balance_conc: dict
    mass_balance_dil: dict
    verification: dict = field(default_factory=dict)
    J_cem: Optional[np.ndarray] = None
    J_aem: Optional[np.ndarray] = None


def run_simulation(config: SimulationConfig, verbose: bool = True) -> SimulationResult:
    """
    Run a complete RED cell-pair simulation.

    Steps:
    1. Create geometry
    2. Solve flow (analytical Poiseuille)
    3. Iteratively solve coupled ion transport
    4. Compute membrane interface profiles
    5. Compute electrical performance

    Parameters
    ----------
    config : SimulationConfig
        Simulation configuration
    verbose : bool
        Print progress information

    Returns
    -------
    SimulationResult
        Complete simulation results
    """
    t_start = time.time()

    if verbose:
        print(f"=" * 60)
        print(f"RED Cell-Pair Simulation: {config.case_id}")
        print(f"=" * 60)

    # 1. Create geometry
    geom = CellPairGeometry(
        channel_height=config.channel_height,
        channel_length=config.channel_length,
        nx=config.nx,
        ny_per_channel=config.ny,
        membrane_thickness_cem=config.membrane_thickness_cem,
        membrane_thickness_aem=config.membrane_thickness_aem,
    )

    if verbose:
        print(geom.summary())

    # 2. Solve flow
    if verbose:
        print("\n--- Solving flow ---")

    mu_eff = config.mu_eff
    D_na_eff = config.D_na_eff
    D_cl_eff = config.D_cl_eff

    flow_conc = analytical_poiseuille_2d(
        geom.concentrated, config.u_mean_conc, config.rho, mu_eff
    )
    flow_dil = analytical_poiseuille_2d(
        geom.dilute, config.u_mean_dil, config.rho, mu_eff
    )

    if verbose:
        print(f"Conc channel: Re = {flow_conc.Re:.2f}, "
              f"Delta_P = {flow_conc.delta_p:.2f} Pa")
        print(f"Dil  channel: Re = {flow_dil.Re:.2f}, "
              f"Delta_P = {flow_dil.delta_p:.2f} Pa")

    # 3. Iteratively solve coupled ion transport
    if verbose:
        print("\n--- Solving ion transport (coupled) ---")

    D_eff = config.D_eff
    t_na_sol = D_na_eff / (D_na_eff + D_cl_eff)
    t_cl_sol = D_cl_eff / (D_na_eff + D_cl_eff)

    # Membrane properties
    cem = MembraneProperties(
        membrane_type='CEM',
        thickness=config.membrane_thickness_cem,
        fixed_charge_density=config.X_cem,
        D_counter=config.D_counter_cem,
        D_co=config.D_co_cem,
    )
    aem = MembraneProperties(
        membrane_type='AEM',
        thickness=config.membrane_thickness_aem,
        fixed_charge_density=config.X_aem,
        D_counter=config.D_counter_aem,
        D_co=config.D_co_aem,
    )

    # Initialize concentrations
    c_conc = np.full((config.nx, config.ny), config.c_conc_inlet)
    c_dil = np.full((config.nx, config.ny), config.c_dil_inlet)

    convergence_history = []
    converged = False
    J_cem = np.zeros(config.nx)
    J_aem = np.zeros(config.nx)

    for coupling_iter in range(config.max_coupling_iter):
        # Get wall concentrations from previous iteration
        # CEM interface: bottom of conc channel (j=0), top of dil channel (j=-1)
        c_conc_at_cem = c_conc[:, 0]   # bottom wall of concentrated channel
        c_dil_at_cem = c_dil[:, -1]    # top wall of dilute channel

        # AEM interface: top of conc channel (j=-1), bottom of dil channel (j=0)
        c_conc_at_aem = c_conc[:, -1]  # top wall of concentrated channel
        c_dil_at_aem = c_dil[:, 0]     # bottom wall of dilute channel

        # Operating Faradaic current density (0.0 for open-circuit default)
        if config.current_density is not None:
            I_op = float(config.current_density)
        elif config.load_fraction > 0.0:
            prof_tmp = compute_membrane_interface_profiles(
                c_conc_wall=c_conc_at_cem,
                c_dil_wall=c_dil_at_cem,
                x=geom.concentrated.x,
                X_fix_cem=config.X_cem,
                X_fix_aem=config.X_aem,
                T=config.T
            )
            elec_tmp = compute_cell_pair_performance(
                c_conc_avg=float(np.mean(c_conc)),
                c_dil_avg=float(np.mean(c_dil)),
                channel_height=config.channel_height,
                membrane_thickness_cem=config.membrane_thickness_cem,
                membrane_thickness_aem=config.membrane_thickness_aem,
                sigma_cem=config.sigma_cem,
                sigma_aem=config.sigma_aem,
                alpha_cem=float(np.mean(prof_tmp['cem']['permselectivity_conc'])),
                alpha_aem=float(np.mean(prof_tmp['aem']['permselectivity_conc'])),
                delta_p_conc=flow_conc.delta_p,
                delta_p_dil=flow_dil.delta_p,
                u_mean_conc=config.u_mean_conc,
                u_mean_dil=config.u_mean_dil,
                eta_pump=config.eta_pump,
                T=config.T,
                channel_length=config.channel_length,
                D_na=D_na_eff,
                D_cl=D_cl_eff,
            )
            I_op = config.load_fraction * (elec_tmp.E_ocv / elec_tmp.R_internal)
        else:
            I_op = 0.0

        # Calculate local trans-membrane salt flux through CEM and AEM (positive: conc -> dil)
        J_cem = np.zeros(config.nx)
        J_aem = np.zeros(config.nx)
        for i in range(config.nx):
            J_diff_cem = membrane_salt_flux(c_conc_at_cem[i], c_dil_at_cem[i], cem, config.T)
            J_diff_aem = membrane_salt_flux(c_conc_at_aem[i], c_dil_at_aem[i], aem, config.T)
            if I_op != 0.0:
                don_cem_c = donnan_equilibrium_1to1(c_conc_at_cem[i], config.X_cem, config.T)
                don_cem_d = donnan_equilibrium_1to1(c_dil_at_cem[i], config.X_cem, config.T)
                alpha_cem_i = 0.5 * (don_cem_c.permselectivity + don_cem_d.permselectivity)
                t_na_cem = 0.5 * (1.0 + alpha_cem_i)

                don_aem_c = donnan_equilibrium_1to1(c_conc_at_aem[i], config.X_aem, config.T)
                don_aem_d = donnan_equilibrium_1to1(c_dil_at_aem[i], config.X_aem, config.T)
                alpha_aem_i = 0.5 * (don_aem_c.permselectivity + don_aem_d.permselectivity)
                t_cl_aem = 0.5 * (1.0 + alpha_aem_i)

                J_cem[i] = J_diff_cem + (t_na_cem - t_na_sol) * (I_op / FARADAY)
                J_aem[i] = J_diff_aem + (t_cl_aem - t_cl_sol) * (I_op / FARADAY)
            else:
                J_cem[i] = J_diff_cem
                J_aem[i] = J_diff_aem

        J_cem_avg = float(np.mean(J_cem))
        J_aem_avg = float(np.mean(J_aem))

        # Solve concentrated channel using spatially resolved local fluxes J(x):
        #   Bottom wall (j=0): CEM interface, salt leaves → negative flux
        #   Top wall (j=-1): AEM interface, salt leaves → negative flux
        c_conc_new = solve_advection_diffusion_2d(
            geom=geom.concentrated,
            flow=flow_conc,
            D_eff=D_eff,
            c_inlet=config.c_conc_inlet,
            bc_y_bottom='flux',
            bc_y_top='flux',
            J_bottom=-J_cem,        # salt leaves conc channel through CEM
            J_top=-J_aem,           # salt leaves conc channel through AEM
        )

        # Solve dilute channel using spatially resolved local fluxes J(x):
        #   Bottom wall (j=0): AEM interface, salt enters → positive flux
        #   Top wall (j=-1): CEM interface, salt enters → positive flux
        c_dil_new = solve_advection_diffusion_2d(
            geom=geom.dilute,
            flow=flow_dil,
            D_eff=D_eff,
            c_inlet=config.c_dil_inlet,
            bc_y_bottom='flux',
            bc_y_top='flux',
            J_bottom=J_aem,         # salt enters dil channel through AEM
            J_top=J_cem,            # salt enters dil channel through CEM
        )

        # Ensure positivity
        c_conc_new = np.maximum(c_conc_new, 1e-3)
        c_dil_new = np.maximum(c_dil_new, 1e-3)

        # Under-relaxation
        alpha = config.relaxation
        c_conc_updated = alpha * c_conc_new + (1 - alpha) * c_conc
        c_dil_updated = alpha * c_dil_new + (1 - alpha) * c_dil

        # Convergence check
        err_conc = np.max(np.abs(c_conc_updated - c_conc)) / config.c_conc_inlet
        err_dil = np.max(np.abs(c_dil_updated - c_dil)) / config.c_dil_inlet
        err_max = max(err_conc, err_dil)

        convergence_history.append({
            'iter': coupling_iter,
            'err_conc': err_conc,
            'err_dil': err_dil,
            'err_max': err_max,
            'J_cem_avg': J_cem_avg,
            'J_aem_avg': J_aem_avg,
        })

        if verbose and (coupling_iter % 5 == 0 or coupling_iter < 3):
            print(f"  Iter {coupling_iter:3d}: err_conc={err_conc:.2e}, "
                  f"err_dil={err_dil:.2e}, "
                  f"J_cem={J_cem_avg:.4e}, J_aem={J_aem_avg:.4e}")

        c_conc = c_conc_updated
        c_dil = c_dil_updated

        if err_max < config.coupling_tol:
            converged = True
            if verbose:
                print(f"  *** Converged at iteration {coupling_iter} "
                      f"(err={err_max:.2e}) ***")
            break

    coupling_iterations = coupling_iter + 1
    if not converged and verbose:
        print(f"  WARNING: Not converged after {config.max_coupling_iter} iterations")
        print(f"  Final error: {err_max:.2e}")

    # 4. Compute electric potential
    phi_conc = compute_electric_potential(
        c_conc, geom.concentrated, D_na_eff, D_cl_eff, config.T
    )
    phi_dil = compute_electric_potential(
        c_dil, geom.dilute, D_na_eff, D_cl_eff, config.T
    )

    # 5. Compute membrane interface profiles
    # CEM interface: bottom of conc (j=0), top of dil (j=-1)
    c_conc_wall_cem = c_conc[:, 0]
    c_dil_wall_cem = c_dil[:, -1]

    membrane_profiles = compute_membrane_interface_profiles(
        c_conc_wall=c_conc_wall_cem,
        c_dil_wall=c_dil_wall_cem,
        x=geom.concentrated.x,
        X_fix_cem=config.X_cem,
        X_fix_aem=config.X_aem,
        T=config.T
    )

    # 6. Compute electrical performance
    c_conc_avg = np.mean(c_conc)
    c_dil_avg = np.mean(c_dil)

    # Average permselectivity
    alpha_cem_avg = np.mean(membrane_profiles['cem']['permselectivity_conc'])
    alpha_aem_avg = np.mean(membrane_profiles['aem']['permselectivity_conc'])

    electrical = compute_cell_pair_performance(
        c_conc_avg=c_conc_avg,
        c_dil_avg=c_dil_avg,
        channel_height=config.channel_height,
        membrane_thickness_cem=config.membrane_thickness_cem,
        membrane_thickness_aem=config.membrane_thickness_aem,
        sigma_cem=config.sigma_cem,
        sigma_aem=config.sigma_aem,
        alpha_cem=alpha_cem_avg,
        alpha_aem=alpha_aem_avg,
        delta_p_conc=flow_conc.delta_p,
        delta_p_dil=flow_dil.delta_p,
        u_mean_conc=config.u_mean_conc,
        u_mean_dil=config.u_mean_dil,
        eta_pump=config.eta_pump,
        T=config.T,
        channel_length=config.channel_length,
        D_na=D_na_eff,
        D_cl=D_cl_eff,
    )

    # 7. Mass balance checks using spatially resolved wall fluxes
    mb_conc = check_mass_balance(
        c_conc, flow_conc, geom.concentrated,
        J_wall_bottom=-J_cem,
        J_wall_top=-J_aem
    )
    mb_dil = check_mass_balance(
        c_dil, flow_dil, geom.dilute,
        J_wall_bottom=J_aem,
        J_wall_top=J_cem
    )

    wall_time = time.time() - t_start

    if verbose:
        print(f"\n--- Results ---")
        print(f"E_OCV = {electrical.E_ocv*1000:.2f} mV")
        print(f"R_internal = {electrical.R_internal*1e4:.4f} Ohm*cm2")
        print(f"P_gross_max = {electrical.P_gross_max:.4f} W/m2")
        print(f"P_pump_total = {electrical.P_pump_total:.6f} W/m2")
        print(f"P_net_max = {electrical.P_net_max:.4f} W/m2")
        print(f"Permselectivity CEM: {alpha_cem_avg:.4f}")
        print(f"Permselectivity AEM: {alpha_aem_avg:.4f}")
        print(f"Mass balance conc: {mb_conc['relative_error']:.2e}")
        print(f"Mass balance dil:  {mb_dil['relative_error']:.2e}")
        print(f"Wall time: {wall_time:.2f} s")
        print(f"Converged: {converged}")

    result = SimulationResult(
        config=config,
        geometry=geom,
        flow_conc=flow_conc,
        flow_dil=flow_dil,
        c_conc=c_conc,
        c_dil=c_dil,
        phi_conc=phi_conc,
        phi_dil=phi_dil,
        membrane_profiles=membrane_profiles,
        electrical=electrical,
        convergence_history=convergence_history,
        coupling_iterations=coupling_iterations,
        converged=converged,
        wall_time_seconds=wall_time,
        mass_balance_conc=mb_conc,
        mass_balance_dil=mb_dil,
        J_cem=J_cem,
        J_aem=J_aem,
    )

    return result
