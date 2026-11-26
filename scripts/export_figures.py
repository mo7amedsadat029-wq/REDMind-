"""
Generate and export all 11 scientific figures for the final technical report.
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.reference_simulator import SimulationConfig, run_simulation
from src.scaling_indicator import compute_scaling_at_interfaces
from src.verification import test_9_mesh_convergence_study
from src.plotting import export_all_figures


def main():
    print("=" * 70)
    print("GENERATING ALL 11 PUBLICATION-QUALITY FIGURES")
    print("=" * 70)

    # 1. Baseline simulation
    cfg = SimulationConfig(
        case_id="figure_generation_case",
        channel_height=270e-6,
        channel_length=0.10,
        u_mean_conc=0.01,
        u_mean_dil=0.01,
        c_conc_inlet=500.0,
        c_dil_inlet=17.0,
        nx=50,
        ny=20
    )
    sim = run_simulation(cfg, verbose=False)

    # 2. Geochemical scaling diagnostic
    scaling = compute_scaling_at_interfaces(sim)

    # 3. Mesh refinement results
    print("Gathering mesh convergence data...")
    mesh_test = test_9_mesh_convergence_study()
    mesh_results = mesh_test.details['grids']

    # 4. Export all figures
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'results', 'figures'))
    export_all_figures(sim, scaling, mesh_results, output_dir)
    print("Figure generation complete.")


if __name__ == '__main__':
    main()
