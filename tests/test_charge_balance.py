"""Test electroneutrality and charge balance."""
import numpy as np
from src.reference_simulator import SimulationConfig, run_simulation


def test_charge_balance():
    cfg = SimulationConfig(nx=30, ny=10, max_coupling_iter=10)
    sim = run_simulation(cfg, verbose=False)
    # Binary 1:1 electroneutrality
    charge_res_conc = np.max(np.abs(sim.c_conc - sim.c_conc))
    charge_res_dil = np.max(np.abs(sim.c_dil - sim.c_dil))
    assert charge_res_conc == 0.0
    assert charge_res_dil == 0.0
