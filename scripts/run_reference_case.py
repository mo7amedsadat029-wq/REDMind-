"""
Run the single baseline reference case matching Gurreri et al. (2017).
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.reference_simulator import SimulationConfig, run_simulation
from src.scaling_indicator import compute_scaling_at_interfaces


def main():
    print("Executing RED baseline reference simulation...")
    cfg = SimulationConfig(
        case_id="gurreri_2017_baseline",
        channel_height=270e-6,
        channel_length=0.10,
        u_mean_conc=0.01,
        u_mean_dil=0.01,
        c_conc_inlet=500.0,
        c_dil_inlet=17.0,
        nx=60,
        ny=25,
        max_coupling_iter=30
    )
    result = run_simulation(cfg, verbose=True)
    scaling = compute_scaling_at_interfaces(result)
    print("\n--- Scaling Diagnostic ---")
    print(f"CEM concentrated interface max Calcite SI: {scaling['cem_conc'].max_si:.3f}")
    print(f"Supersaturated: {scaling['cem_conc'].is_supersaturated}")
    print("Baseline reference run completed successfully.")


if __name__ == '__main__':
    main()
