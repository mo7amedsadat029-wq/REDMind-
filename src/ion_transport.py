"""
Ion transport solver for 2D RED cell-pair simulation.

Solves the steady-state Nernst-Planck equations for binary NaCl electrolyte
with local electroneutrality in a 2D channel.

Governing equations (steady state, no reactions):

    ∇·J_i = 0    for each species i

where the Nernst-Planck flux is:

    J_i = u*c_i - D_i*∇c_i - (z_i*D_i*F*c_i)/(R*T) * ∇φ

For a binary 1:1 electrolyte (NaCl) with local electroneutrality:
    c_Na = c_Cl = c  (salt concentration)

The electroneutrality condition eliminates the electric potential from
the concentration equation, giving an effective advection-diffusion
equation for the salt concentration:

    u·∇c = D_eff * ∇²c

where D_eff is the ambipolar (salt) diffusion coefficient:

    D_eff = 2*D_Na*D_Cl / (D_Na + D_Cl)   (Nernst-Hartley)

The electric potential can then be recovered from the current-potential
relation after solving for concentration.

Numerical method:
    Finite difference with upwind advection and central diffusion.
    Iterative solver (Gauss-Seidel or SciPy sparse solver).

References:
    Gurreri et al. (2017), Desalination, 423, 52-64.
    Tedesco et al. (2016), J. Membrane Science, 510, 370-381.
    Newman & Thomas-Alyea, Electrochemical Systems, 3rd ed.
"""

import numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve
from typing import Tuple, Optional, Union
from dataclasses import dataclass

from src.geometry import ChannelGeometry, CellPairGeometry
from src.flow_solver import FlowSolution

_trapz = getattr(np, "trapezoid", getattr(np, "trapz", None))


@dataclass
class TransportSolution:
    """Container for ion transport solution in a single channel."""
    c: np.ndarray           # salt concentration [nx, ny] (mol/m³)
    c_na: np.ndarray        # Na+ concentration [nx, ny] (mol/m³)
    c_cl: np.ndarray        # Cl- concentration [nx, ny] (mol/m³)
    phi: np.ndarray         # electric potential [nx, ny] (V)
    Jx_diff: np.ndarray     # diffusive flux x-component [nx, ny]
    Jy_diff: np.ndarray     # diffusive flux y-component [nx, ny]
    x: np.ndarray           # x coordinates [nx]
    y: np.ndarray           # y coordinates [ny]
    c_inlet: float          # inlet concentration (mol/m³)
    channel_type: str       # 'concentrated' or 'dilute'
    mass_balance_error: float  # relative mass balance error


# Physical constants
FARADAY = 96485.3329    # C/mol
GAS_CONST = 8.31446     # J/(mol·K)


def ambipolar_diffusivity(D_plus: float, D_minus: float) -> float:
    """
    Calculate the ambipolar (salt) diffusion coefficient for a 1:1 electrolyte.

    D_salt = 2 * D+ * D- / (D+ + D-)

    This is the Nernst-Hartley equation for a symmetric binary electrolyte.

    Parameters
    ----------
    D_plus : float
        Cation diffusion coefficient (m²/s)
    D_minus : float
        Anion diffusion coefficient (m²/s)

    Returns
    -------
    float
        Salt diffusion coefficient (m²/s)
    """
    return 2.0 * D_plus * D_minus / (D_plus + D_minus)


def _flux_at(J: Optional[Union[float, np.ndarray]], i: int) -> float:
    """Return scalar flux at streamwise index i for float or 1D array input."""
    if J is None:
        return 0.0
    if isinstance(J, np.ndarray):
        return float(J[i])
    return float(J)


def solve_advection_diffusion_2d(
    geom: ChannelGeometry,
    flow: FlowSolution,
    D_eff: float,
    c_inlet: float,
    bc_y_bottom: str = 'flux',
    bc_y_top: str = 'flux',
    J_bottom: Optional[Union[float, np.ndarray]] = None,
    J_top: Optional[Union[float, np.ndarray]] = None,
    c_wall_bottom: Optional[float] = None,
    c_wall_top: Optional[float] = None,
) -> np.ndarray:
    """
    Solve 2D steady advection-diffusion equation using finite differences.

    u * ∂c/∂x + v * ∂c/∂y = D * (∂²c/∂x² + ∂²c/∂y²)

    Uses first-order upwind for advection, second-order central for diffusion.
    Assembled as a sparse linear system and solved directly.

    Boundary conditions:
    - Inlet (x=0): c = c_inlet (Dirichlet)
    - Outlet (x=L): ∂c/∂x = 0 (Neumann, fully developed)
    - Walls (y=0, y=H): flux or Dirichlet as specified

    Parameters
    ----------
    geom : ChannelGeometry
        Channel geometry
    flow : FlowSolution
        Flow solution providing velocity field
    D_eff : float
        Effective (ambipolar) diffusion coefficient (m²/s)
    c_inlet : float
        Inlet concentration (mol/m³)
    bc_y_bottom, bc_y_top : str
        'flux' for Neumann (specify J_bottom/J_top) or
        'dirichlet' for fixed concentration (specify c_wall_bottom/c_wall_top)
        or 'zero_flux' for impermeable wall
    J_bottom, J_top : float, optional
        Wall-normal flux (mol/(m²·s)), positive into the channel
    c_wall_bottom, c_wall_top : float, optional
        Wall concentration (mol/m³) for Dirichlet BC

    Returns
    -------
    np.ndarray
        Concentration field c[nx, ny] (mol/m³)
    """
    nx = geom.nx
    ny = geom.ny
    dx = geom.dx
    dy = geom.dy

    N = nx * ny  # total unknowns

    # Build sparse matrix and RHS
    # Index mapping: node (i,j) -> k = i*ny + j
    rows = []
    cols = []
    vals = []
    rhs = np.zeros(N)

    def idx(i, j):
        return i * ny + j

    for i in range(nx):
        for j in range(ny):
            k = idx(i, j)

            # --- Inlet boundary (i=0) ---
            if i == 0:
                rows.append(k)
                cols.append(k)
                vals.append(1.0)
                rhs[k] = c_inlet
                continue

            # --- Bottom wall (j=0) ---
            if j == 0:
                if bc_y_bottom == 'zero_flux':
                    # ∂c/∂y = 0 at y=0 => c[i,0] = c[i,1]
                    rows.append(k)
                    cols.append(k)
                    vals.append(1.0)
                    rows.append(k)
                    cols.append(idx(i, 1))
                    vals.append(-1.0)
                    rhs[k] = 0.0
                elif bc_y_bottom == 'flux':
                    # -D * ∂c/∂y|_{y=0} = J_bottom (positive = into channel)
                    # Forward difference: ∂c/∂y ≈ (c[i,1] - c[i,0]) / dy
                    # -D * (c[i,1] - c[i,0]) / dy = J_bottom
                    # c[i,0] - c[i,1] = J_bottom * dy / D
                    J_val = _flux_at(J_bottom, i)
                    rows.append(k)
                    cols.append(k)
                    vals.append(1.0)
                    rows.append(k)
                    cols.append(idx(i, 1))
                    vals.append(-1.0)
                    rhs[k] = J_val * dy / D_eff
                elif bc_y_bottom == 'dirichlet':
                    rows.append(k)
                    cols.append(k)
                    vals.append(1.0)
                    rhs[k] = c_wall_bottom if c_wall_bottom is not None else c_inlet
                continue

            # --- Top wall (j=ny-1) ---
            if j == ny - 1:
                if bc_y_top == 'zero_flux':
                    # ∂c/∂y = 0 at y=H => c[i,ny-1] = c[i,ny-2]
                    rows.append(k)
                    cols.append(k)
                    vals.append(1.0)
                    rows.append(k)
                    cols.append(idx(i, ny - 2))
                    vals.append(-1.0)
                    rhs[k] = 0.0
                elif bc_y_top == 'flux':
                    # -D * ∂c/∂y|_{y=H} = -J_top (negative because outward normal is +y)
                    # Backward difference: ∂c/∂y ≈ (c[i,ny-1] - c[i,ny-2]) / dy
                    # -D * (c[i,ny-1] - c[i,ny-2]) / dy = -J_top
                    # c[i,ny-1] - c[i,ny-2] = J_top * dy / D
                    J_val = _flux_at(J_top, i)
                    rows.append(k)
                    cols.append(k)
                    vals.append(1.0)
                    rows.append(k)
                    cols.append(idx(i, ny - 2))
                    vals.append(-1.0)
                    rhs[k] = J_val * dy / D_eff
                elif bc_y_top == 'dirichlet':
                    rows.append(k)
                    cols.append(k)
                    vals.append(1.0)
                    rhs[k] = c_wall_top if c_wall_top is not None else c_inlet
                continue

            # --- Outlet boundary (i=nx-1), interior j ---
            if i == nx - 1:
                # ∂c/∂x = 0 at outlet => c[nx-1,j] = c[nx-2,j]
                rows.append(k)
                cols.append(k)
                vals.append(1.0)
                rows.append(k)
                cols.append(idx(nx - 2, j))
                vals.append(-1.0)
                rhs[k] = 0.0
                continue

            # --- Interior nodes ---
            u_ij = flow.u[i, j]
            v_ij = flow.v[i, j]

            # Advection: first-order upwind
            # x-direction
            if u_ij >= 0:
                # upwind from i-1
                a_adv_x_center = u_ij / dx
                a_adv_x_upwind = -u_ij / dx
                i_upwind_x = i - 1
            else:
                # upwind from i+1
                a_adv_x_center = -u_ij / dx
                a_adv_x_upwind = u_ij / dx
                i_upwind_x = i + 1

            # y-direction
            if v_ij >= 0:
                a_adv_y_center = v_ij / dy
                a_adv_y_upwind = -v_ij / dy
                j_upwind_y = j - 1
            else:
                a_adv_y_center = -v_ij / dy
                a_adv_y_upwind = v_ij / dy
                j_upwind_y = j + 1

            # Diffusion: central differences
            a_diff_x = D_eff / dx**2
            a_diff_y = D_eff / dy**2
            a_diff_center = -2.0 * D_eff / dx**2 - 2.0 * D_eff / dy**2

            # Combined coefficients
            a_center = a_adv_x_center + a_adv_y_center - a_diff_center
            a_im1 = a_adv_x_upwind if u_ij >= 0 else 0.0
            a_ip1 = a_adv_x_upwind if u_ij < 0 else 0.0
            a_jm1 = a_adv_y_upwind if v_ij >= 0 else 0.0
            a_jp1 = a_adv_y_upwind if v_ij < 0 else 0.0

            # Add diffusion contributions
            if u_ij >= 0:
                a_im1 += -a_diff_x
            else:
                a_ip1 += -a_diff_x
            a_im1_diff = -a_diff_x
            a_ip1_diff = -a_diff_x
            a_jm1_diff = -a_diff_y
            a_jp1_diff = -a_diff_y

            # Rewrite: proper assembly
            # The equation is: u*∂c/∂x + v*∂c/∂y = D*(∂²c/∂x² + ∂²c/∂y²)
            # Rearranged: -D*∂²c/∂x² - D*∂²c/∂y² + u*∂c/∂x + v*∂c/∂y = 0

            # Central node
            a_C = (2.0 * D_eff / dx**2 + 2.0 * D_eff / dy**2
                   + max(u_ij, 0) / dx + max(-u_ij, 0) / dx
                   + max(v_ij, 0) / dy + max(-v_ij, 0) / dy)

            # West (i-1, j)
            a_W = -D_eff / dx**2 - max(u_ij, 0) / dx

            # East (i+1, j)
            a_E = -D_eff / dx**2 - max(-u_ij, 0) / dx

            # South (i, j-1)
            a_S = -D_eff / dy**2 - max(v_ij, 0) / dy

            # North (i, j+1)
            a_N = -D_eff / dy**2 - max(-v_ij, 0) / dy

            # Add to sparse matrix
            rows.append(k); cols.append(k); vals.append(a_C)
            rows.append(k); cols.append(idx(i-1, j)); vals.append(a_W)
            rows.append(k); cols.append(idx(i+1, j)); vals.append(a_E)
            rows.append(k); cols.append(idx(i, j-1)); vals.append(a_S)
            rows.append(k); cols.append(idx(i, j+1)); vals.append(a_N)

            rhs[k] = 0.0

    # Assemble and solve
    A = sparse.csr_matrix(
        (vals, (rows, cols)), shape=(N, N)
    )
    c_flat = spsolve(A, rhs)
    c = c_flat.reshape((nx, ny))

    return c


def compute_electric_potential(
    c: np.ndarray,
    geom: ChannelGeometry,
    D_na: float,
    D_cl: float,
    T: float = 298.15
) -> np.ndarray:
    """
    Compute the electric potential from the electroneutrality condition.

    For a binary 1:1 electrolyte with electroneutrality (c_Na = c_Cl = c),
    the potential gradient is related to the concentration gradient by:

        ∇φ = -(RT/F) * (D_Na - D_Cl)/(D_Na + D_Cl) * (∇c/c)

    This is the liquid junction potential (diffusion potential).

    Integration gives:
        φ(x,y) = φ_ref - (RT/F) * (D_Na - D_Cl)/(D_Na + D_Cl) * ln(c/c_ref)

    Parameters
    ----------
    c : np.ndarray
        Salt concentration field [nx, ny] (mol/m³)
    geom : ChannelGeometry
        Channel geometry
    D_na, D_cl : float
        Ion diffusion coefficients (m²/s)
    T : float
        Temperature (K)

    Returns
    -------
    np.ndarray
        Electric potential field [nx, ny] (V)
    """
    # Transport number difference
    t_factor = (D_na - D_cl) / (D_na + D_cl)

    # Reference: inlet concentration
    c_ref = c[0, c.shape[1] // 2]  # center of inlet

    # Avoid log of zero
    c_safe = np.maximum(c, 1e-10)

    phi = -(GAS_CONST * T / FARADAY) * t_factor * np.log(c_safe / c_ref)

    return phi


def compute_diffusive_flux(
    c: np.ndarray,
    geom: ChannelGeometry,
    D_eff: float
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Compute diffusive salt flux components.

    J_diff = -D_eff * ∇c

    Parameters
    ----------
    c : np.ndarray
        Concentration field [nx, ny]
    geom : ChannelGeometry
        Channel geometry
    D_eff : float
        Effective diffusion coefficient

    Returns
    -------
    Tuple[np.ndarray, np.ndarray]
        (Jx_diff, Jy_diff) - diffusive flux components
    """
    # Central differences for interior, one-sided at boundaries
    Jx = np.zeros_like(c)
    Jy = np.zeros_like(c)

    # x-direction
    Jx[1:-1, :] = -D_eff * (c[2:, :] - c[:-2, :]) / (2 * geom.dx)
    Jx[0, :] = -D_eff * (c[1, :] - c[0, :]) / geom.dx
    Jx[-1, :] = -D_eff * (c[-1, :] - c[-2, :]) / geom.dx

    # y-direction
    Jy[:, 1:-1] = -D_eff * (c[:, 2:] - c[:, :-2]) / (2 * geom.dy)
    Jy[:, 0] = -D_eff * (c[:, 1] - c[:, 0]) / geom.dy
    Jy[:, -1] = -D_eff * (c[:, -1] - c[:, -2]) / geom.dy

    return Jx, Jy


def check_mass_balance(
    c: np.ndarray,
    flow: FlowSolution,
    geom: ChannelGeometry,
    J_wall_bottom: Union[float, np.ndarray] = 0.0,
    J_wall_top: Union[float, np.ndarray] = 0.0
) -> dict:
    """
    Check species mass balance for the channel.

    For steady state with no reactions:
        inlet flux = outlet flux + wall flux (net)

    Mass flow rate per unit width:
        m_dot = integral(u * c * dy)

    Parameters
    ----------
    c : np.ndarray
        Concentration field [nx, ny]
    flow : FlowSolution
        Flow solution
    geom : ChannelGeometry
        Channel geometry
    J_wall_bottom, J_wall_top : float or np.ndarray
        Wall fluxes (mol/(m²·s)), positive = into channel

    Returns
    -------
    dict
        Mass balance results
    """
    y = geom.y

    # Inlet mass flow (x=0)
    m_in = _trapz(flow.u[0, :] * c[0, :], y)

    # Outlet mass flow (x=L)
    m_out = _trapz(flow.u[-1, :] * c[-1, :], y)

    # Wall flux integrated over length
    J_bot_arr = np.broadcast_to(np.asarray(J_wall_bottom, dtype=float), (geom.nx,))
    J_top_arr = np.broadcast_to(np.asarray(J_wall_top, dtype=float), (geom.nx,))
    wall_flux_total = float(_trapz(J_bot_arr + J_top_arr, geom.x))

    # Balance: m_in + wall_flux_total = m_out
    # (wall flux positive means mass enters the channel)
    residual = m_in + wall_flux_total - m_out
    relative_error = abs(residual) / max(abs(m_in), 1e-30)

    return {
        'm_in': m_in,
        'm_out': m_out,
        'wall_flux_total': wall_flux_total,
        'residual': residual,
        'relative_error': relative_error,
        'pass': relative_error < 0.01  # 1% tolerance
    }


def solve_channel_transport(
    geom: ChannelGeometry,
    flow: FlowSolution,
    c_inlet: float,
    D_na: float,
    D_cl: float,
    T: float,
    bc_y_bottom: str = 'zero_flux',
    bc_y_top: str = 'zero_flux',
    J_bottom: Optional[float] = None,
    J_top: Optional[float] = None,
    channel_type: str = 'unknown'
) -> TransportSolution:
    """
    Solve ion transport in a single channel.

    Combines advection-diffusion for salt concentration,
    electric potential recovery, and flux calculation.

    Parameters
    ----------
    geom : ChannelGeometry
        Channel geometry
    flow : FlowSolution
        Flow solution
    c_inlet : float
        Inlet salt concentration (mol/m³)
    D_na, D_cl : float
        Ion diffusion coefficients (m²/s)
    T : float
        Temperature (K)
    bc_y_bottom, bc_y_top : str
        Wall boundary condition type
    J_bottom, J_top : float, optional
        Wall fluxes for Neumann BC
    channel_type : str
        'concentrated' or 'dilute'

    Returns
    -------
    TransportSolution
        Complete transport solution
    """
    D_eff = ambipolar_diffusivity(D_na, D_cl)

    # Solve advection-diffusion for salt concentration
    c = solve_advection_diffusion_2d(
        geom=geom,
        flow=flow,
        D_eff=D_eff,
        c_inlet=c_inlet,
        bc_y_bottom=bc_y_bottom,
        bc_y_top=bc_y_top,
        J_bottom=J_bottom,
        J_top=J_top,
    )

    # For binary 1:1 electrolyte with electroneutrality
    c_na = c.copy()
    c_cl = c.copy()

    # Electric potential from diffusion potential
    phi = compute_electric_potential(c, geom, D_na, D_cl, T)

    # Diffusive fluxes
    Jx_diff, Jy_diff = compute_diffusive_flux(c, geom, D_eff)

    # Mass balance
    mb = check_mass_balance(
        c, flow, geom,
        J_wall_bottom=J_bottom if J_bottom else 0.0,
        J_wall_top=J_top if J_top else 0.0
    )

    return TransportSolution(
        c=c,
        c_na=c_na,
        c_cl=c_cl,
        phi=phi,
        Jx_diff=Jx_diff,
        Jy_diff=Jy_diff,
        x=geom.x,
        y=geom.y,
        c_inlet=c_inlet,
        channel_type=channel_type,
        mass_balance_error=mb['relative_error']
    )
