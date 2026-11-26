"""
Generate reference scientific dataset for future PINN training.

Generates Latin Hypercube sampled parameter sets, runs the validated 2D
reference simulator, computes scaling diagnostics, and exports spatial fields,
metadata tables, failure logs, and JSON manifest.
"""
import sys
import os
import time
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.sampling import sample_parameter_space_lhs
from src.reference_simulator import run_simulation
from src.scaling_indicator import compute_scaling_at_interfaces
from src.dataset_writer import export_dataset


def main():
    print("=" * 70, flush=True)
    print("STARTING SCIENTIFIC DATASET GENERATION PIPELINE", flush=True)
    print("=" * 70, flush=True)

    n_samples = 50  # 50 cases for robust, rapid CPU execution on 16 GB laptop
    print(f"Sampling {n_samples} configurations via Latin Hypercube Design...", flush=True)
    configs = sample_parameter_space_lhs(n_samples=n_samples, random_seed=42, grid_nx=40, grid_ny=15)

    results = []
    scaling_list = []
    failed_runs = []

    t_start_total = time.time()

    for idx, cfg in enumerate(configs):
        t0 = time.time()
        try:
            res = run_simulation(cfg, verbose=False)
            dt = time.time() - t0

            if res.converged:
                sc = compute_scaling_at_interfaces(res)
                results.append(res)
                scaling_list.append(sc)
                print(f"[{idx+1:02d}/{len(configs)}] {cfg.case_id} CONVERGED in {res.coupling_iterations:2d} iters "
                      f"({dt:.2f} s) - P_gross={res.electrical.P_gross_max:.2f} W/m2, OCV={res.electrical.E_ocv*1000:.1f} mV", flush=True)
            else:
                failed_runs.append({
                    'case_id': cfg.case_id,
                    'reason': "Convergence tolerance not reached within max iterations",
                    'error_detail': f"Final err: {res.convergence_history[-1]['err_max']:.2e}"
                })
                print(f"[{idx+1:02d}/{len(configs)}] {cfg.case_id} UNCONVERGED (logged to failure registry)", flush=True)
        except Exception as e:
            failed_runs.append({
                'case_id': cfg.case_id,
                'reason': "Runtime exception",
                'error_detail': str(e)
            })
            print(f"[{idx+1:02d}/{len(configs)}] {cfg.case_id} FAILED: {e}", flush=True)

    total_time = time.time() - t_start_total

    print("\n--- Exporting Datasets and Manifest ---", flush=True)
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data'))
    paths = export_dataset(results, scaling_list, failed_runs, data_dir)

    print(f"Dataset generation complete in {total_time:.1f} s.", flush=True)
    print(f"Converged cases exported: {len(results)} / {len(configs)}", flush=True)
    print(f"Failed cases logged:     {len(failed_runs)}", flush=True)
    print(f"Metadata CSV:            {paths['metadata_csv']}", flush=True)
    print(f"Manifest JSON:           {paths['manifest_json']}", flush=True)
    print(f"Failure Log:             {paths['failure_log']}", flush=True)


if __name__ == '__main__':
    main()
