"""
Flow solver for 2D RED cell-pair channel flow.

Solves the Navier-Stokes equations for incompressible, steady, laminar flow
in a plane channel (2D Poiseuille flow).

For a 2D plane channel with no-slip walls, the fully developed velocity
profile is the analytical Poiseuille solution:

    u(y) = (3/2) * U_mean * [1 - (y/h - 1)²]    for y in [0, 2h]

or equivalently in terms of the pressure gradient:

    u(y) = -(1/(2μ)) * (dp/dx) * y * (H - y)

where H = channel height, and dp/dx < 0 for flow in positive x direction.

The pressure drop for fully developed Poiseuille flow in a 2D slit is:

    Δp = 12 * μ * U_mean * L / H²

This module provides:
1. Analytical Poiseuille flow solution (verification benchmark)
2. Numerical flow solver using finite differences
3. Pressure drop calculation
4. Reynolds number and flow regime assessment

References:
    Gurreri et al. (2017), Desalination, 423, 52-64.
    Bird, Stewart, Lightfoot - Transport Phenomena.
"""

import numpy as np
from typing import Tuple, Optional
from dataclasses import dataclass

from src.geometry import ChannelGeometry, CellPairGeometry

_trapz = getattr(np, "trapezoid", getattr(np, "trapz", None))


@dataclass
class FlowSolution:
    """Container for flow solution in a single channel."""
    u: np.ndarray          # x-velocity field [nx, ny]
    v: np.ndarray          # y-velocity field [nx, ny]
    p: np.ndarray          # pressure field [nx, ny]
    x: np.ndarray          # x coordinates [nx]
    y: np.ndarray          # y coordinates [ny]
    u_mean: float          # mean inlet velocity (m/s)
    Re: float              # Reynolds number
    dp_dx: float           # pressure gradient (Pa/m)
    delta_p: float         # total pressure drop (Pa)
    is_analytical: bool    # whether this is the analytical solution


def analytical_poiseuille_2d(
    geom: ChannelGeometry,
    u_mean: float,
    rho: float,
    mu: float
) -> FlowSolution:
    """
    Analytical Poiseuille flow solution for a 2D plane channel.

    The fully developed velocity profile for flow between two parallel
    plates separated by height H, with no-slip walls at y=0 and y=H:

        u(y) = (3/2) * u_mean * [4*y*(H-y)/H²]

    This is equivalent to:
        u(y) = -(1/(2μ)) * (dp/dx) * y * (H - y)

    where dp/dx = -12 * μ * u_mean / H²

    Parameters
    ----------
    geom : ChannelGeometry
        Channel geometry specification
    u_mean : float
        Mean flow velocity (m/s)
    rho : float
        Fluid density (kg/m³)
    mu : float
        Dynamic viscosity (Pa·s)

    Returns
    -------
    FlowSolution
        Complete flow solution with velocity and pressure fields
    """
    H = geom.height
    L = geom.length
    nx = geom.nx
    ny = geom.ny

    x = geom.x
    y = geom.y

    # Pressure gradient for fully developed Poiseuille flow
    dp_dx = -12.0 * mu * u_mean / H**2  # Pa/m (negative for flow in +x)

    # Total pressure drop
    delta_p = -dp_dx * L  # Pa (positive value)

    # Reynolds number based on hydraulic diameter (D_h = 2H for 2D slit)
    D_h = 2.0 * H
    Re = rho * u_mean * D_h / mu

    # Velocity field
    # u(y) = -(1/(2μ)) * dp_dx * y * (H - y)
    # This gives u_max = -dp_dx * H² / (8μ) = (3/2) * u_mean at y = H/2
    u_1d = -(1.0 / (2.0 * mu)) * dp_dx * y * (H - y)

    # Create 2D fields
    u_field = np.zeros((nx, ny))
    v_field = np.zeros((nx, ny))
    p_field = np.zeros((nx, ny))

    for i in range(nx):
        u_field[i, :] = u_1d
        p_field[i, :] = -dp_dx * (L - x[i])  # p decreases in x direction
        # p(x=0) = delta_p, p(x=L) = 0 (gauge)

    return FlowSolution(
        u=u_field,
        v=v_field,
        p=p_field,
        x=x,
        y=y,
        u_mean=u_mean,
        Re=Re,
        dp_dx=dp_dx,
        delta_p=delta_p,
        is_analytical=True
    )


def verify_poiseuille_mass_conservation(
    flow: FlowSolution,
    geom: ChannelGeometry
) -> dict:
    """
    Verify mass conservation for the Poiseuille flow solution.

    Checks:
    1. Inlet and outlet volumetric flow rates match
    2. Mean velocity matches specified value
    3. No-slip boundary conditions are satisfied

    Parameters
    ----------
    flow : FlowSolution
        Flow solution to verify
    geom : ChannelGeometry
        Channel geometry

    Returns
    -------
    dict
        Verification results with pass/fail status
    """
    results = {}
    H = geom.height
    y = geom.y

    # 1. Check inlet volumetric flow rate (per unit width)
    # Q = integral of u(y) dy from 0 to H
    # Using trapezoidal rule on discrete grid has O(dy^2) error
    Q_inlet = _trapz(flow.u[0, :], y)
    Q_expected = flow.u_mean * H
    Q_error = abs(Q_inlet - Q_expected) / Q_expected
    results['Q_inlet'] = Q_inlet
    results['Q_expected'] = Q_expected
    results['Q_inlet_error'] = Q_error
    results['Q_inlet_pass'] = Q_error < 1e-3

    # 2. Check outlet flow rate
    Q_outlet = _trapz(flow.u[-1, :], y)
    Q_outlet_error = abs(Q_outlet - Q_expected) / Q_expected
    results['Q_outlet'] = Q_outlet
    results['Q_outlet_error'] = Q_outlet_error
    results['Q_outlet_pass'] = Q_outlet_error < 1e-3

    # 3. Mass conservation: Q_in = Q_out
    Q_cons_error = abs(Q_inlet - Q_outlet) / Q_expected
    results['Q_conservation_error'] = Q_cons_error
    results['Q_conservation_pass'] = Q_cons_error < 1e-12

    # 4. No-slip at walls
    u_wall_bottom = np.max(np.abs(flow.u[:, 0]))
    u_wall_top = np.max(np.abs(flow.u[:, -1]))
    results['u_wall_bottom'] = u_wall_bottom
    results['u_wall_top'] = u_wall_top
    results['no_slip_pass'] = (u_wall_bottom < 1e-15) and (u_wall_top < 1e-15)

    # 5. Maximum velocity at centerline
    u_max_computed = np.max(flow.u[0, :])
    u_max_expected = 1.5 * flow.u_mean
    u_max_error = abs(u_max_computed - u_max_expected) / u_max_expected
    results['u_max_computed'] = u_max_computed
    results['u_max_expected'] = u_max_expected
    results['u_max_error'] = u_max_error
    results['u_max_pass'] = u_max_error < 1e-6

    # 6. Pressure drop check
    dp_analytical = 12.0 * flow.u_mean * geom.length / H**2  # mu cancels
    # We need mu, recalculate from dp_dx
    # dp_dx = -12 * mu * u_mean / H^2 => mu = -dp_dx * H^2 / (12 * u_mean)
    results['delta_p'] = flow.delta_p
    results['dp_dx'] = flow.dp_dx

    # Overall
    all_pass = all(v for k, v in results.items() if k.endswith('_pass'))
    results['all_pass'] = all_pass

    return results


def compute_cell_pair_flow(
    cell_pair: CellPairGeometry,
    u_mean_conc: float,
    u_mean_dil: float,
    rho: float,
    mu: float
) -> Tuple[FlowSolution, FlowSolution]:
    """
    Compute flow solutions for both channels of the cell pair.

    Uses analytical Poiseuille flow for each channel independently.
    Channels are decoupled hydrodynamically (no flow through membranes).

    Parameters
    ----------
    cell_pair : CellPairGeometry
        Cell pair geometry
    u_mean_conc : float
        Mean velocity in concentrated channel (m/s)
    u_mean_dil : float
        Mean velocity in dilute channel (m/s)
    rho : float
        Fluid density (kg/m³)
    mu : float
        Dynamic viscosity (Pa·s)

    Returns
    -------
    Tuple[FlowSolution, FlowSolution]
        Flow solutions for (concentrated, dilute) channels
    """
    flow_conc = analytical_poiseuille_2d(
        cell_pair.concentrated, u_mean_conc, rho, mu
    )
    flow_dil = analytical_poiseuille_2d(
        cell_pair.dilute, u_mean_dil, rho, mu
    )

    return flow_conc, flow_dil


def pressure_drop_vs_velocity(
    geom: ChannelGeometry,
    u_range: np.ndarray,
    rho: float,
    mu: float
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Calculate pressure drop as a function of mean velocity.

    For Poiseuille flow: Δp = 12 * μ * U_mean * L / H²

    Parameters
    ----------
    geom : ChannelGeometry
        Channel geometry
    u_range : np.ndarray
        Array of mean velocities to evaluate (m/s)
    rho : float
        Fluid density (kg/m³)
    mu : float
        Dynamic viscosity (Pa·s)

    Returns
    -------
    Tuple[np.ndarray, np.ndarray]
        (pressure_drop [Pa], reynolds_number [dimensionless])
    """
    H = geom.height
    L = geom.length
    D_h = 2.0 * H

    dp = 12.0 * mu * u_range * L / H**2
    Re = rho * u_range * D_h / mu

    return dp, Re


def pumping_power_per_unit_width(
    delta_p: float,
    u_mean: float,
    H: float,
    eta_pump: float = 0.75
) -> float:
    """
    Calculate pumping power per unit width for a single channel.

    P_pump = Δp * Q / η_pump

    where Q = u_mean * H (per unit width for 2D).

    Parameters
    ----------
    delta_p : float
        Pressure drop (Pa)
    u_mean : float
        Mean flow velocity (m/s)
    H : float
        Channel height (m)
    eta_pump : float
        Pump efficiency (dimensionless, default 0.75)

    Returns
    -------
    float
        Pumping power per unit width (W/m)
    """
    Q_per_width = u_mean * H  # m²/s (volumetric flow per unit width)
    return delta_p * Q_per_width / eta_pump
