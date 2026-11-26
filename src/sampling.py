"""
Latin Hypercube and space-filling parameter sampling for RED reference simulations.

Generates physically justified parameter combinations for training Physics-Informed
Neural Networks (PINNs) across the operational space of Reverse Electrodialysis.

Input Parameter Ranges:
- u_mean_conc, u_mean_dil : [0.002, 0.05] m/s (0.2 to 5 cm/s)
- c_conc_inlet            : [200.0, 1500.0] mol/m3 (0.2 to 1.5 M NaCl)
- c_dil_inlet             : [5.0, 50.0] mol/m3 (0.005 to 0.05 M NaCl)
- channel_height          : [150e-6, 400e-6] m (150 to 400 um)
- channel_length          : [0.05, 0.15] m (5 to 15 cm)
- temperature_k           : [288.15, 313.15] K (15 to 40 °C)
- X_fixed_charge          : [1500.0, 4000.0] mol/m3 (1.5 to 4.0 M)

References:
    Faghihi & Jalali (2022), Int. J. Energy Research.
    Gurreri et al. (2017), Desalination.
    McKay, M. D., Beckman, R. J., & Conover, W. J. (1979). Latin Hypercube Sampling.
"""

import numpy as np
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional

try:
    from pyDOE2 import lhs
except ImportError:
    # Fallback Latin Hypercube implementation if pyDOE2 is not loaded
    def lhs(n_dim: int, samples: int, criterion: str = 'center') -> np.ndarray:
        result = np.empty((samples, n_dim))
        for j in range(n_dim):
            idx = np.random.permutation(samples)
            result[:, j] = (idx + 0.5) / samples
        return result

from src.reference_simulator import SimulationConfig


PARAMETER_BOUNDS = {
    'u_mean_conc': (0.003, 0.04),         # m/s
    'u_mean_dil': (0.003, 0.04),          # m/s
    'c_conc_inlet': (250.0, 1200.0),      # mol/m3
    'c_dil_inlet': (8.0, 45.0),           # mol/m3
    'channel_height': (180e-6, 360e-6),   # m
    'T': (288.15, 308.15),                # K
    'X_cem_mag': (1500.0, 3500.0),        # mol/m3
}


def sample_parameter_space_lhs(
    n_samples: int = 50,
    random_seed: int = 42,
    grid_nx: int = 40,
    grid_ny: int = 15
) -> List[SimulationConfig]:
    """
    Generate a Latin Hypercube design of simulation configurations.

    Parameters
    ----------
    n_samples : int
        Number of parameter configurations to generate
    random_seed : int
        Seed for reproducibility
    grid_nx, grid_ny : int
        Grid resolution for sampled cases

    Returns
    -------
    List[SimulationConfig]
        List of configured simulation parameter sets
    """
    np.random.seed(random_seed)
    param_keys = list(PARAMETER_BOUNDS.keys())
    n_dim = len(param_keys)

    # Generate unit hypercube samples [0, 1]^n_dim
    unit_samples = lhs(n_dim=n_dim, samples=n_samples, criterion='center')

    configs = []

    # First case is ALWAYS the exact Gurreri baseline reference case
    ref_cfg = SimulationConfig(
        case_id="case_000_reference",
        nx=grid_nx,
        ny=grid_ny,
        u_mean_conc=0.01,
        u_mean_dil=0.01,
        c_conc_inlet=500.0,
        c_dil_inlet=17.0,
        channel_height=270e-6,
        T=298.15,
        X_cem=-2000.0,
        X_aem=2000.0
    )
    configs.append(ref_cfg)

    # Sample remaining cases
    for s_idx in range(n_samples):
        vals = {}
        for p_idx, k in enumerate(param_keys):
            low, high = PARAMETER_BOUNDS[k]
            vals[k] = low + unit_samples[s_idx, p_idx] * (high - low)

        cfg = SimulationConfig(
            case_id=f"case_{s_idx+1:03d}_lhs",
            nx=grid_nx,
            ny=grid_ny,
            u_mean_conc=float(vals['u_mean_conc']),
            u_mean_dil=float(vals['u_mean_dil']),
            c_conc_inlet=float(vals['c_conc_inlet']),
            c_dil_inlet=float(vals['c_dil_inlet']),
            channel_height=float(vals['channel_height']),
            T=float(vals['T']),
            X_cem=-float(vals['X_cem_mag']),
            X_aem=float(vals['X_cem_mag']),
            max_coupling_iter=30
        )
        configs.append(cfg)

    return configs
