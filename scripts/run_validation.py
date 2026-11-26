"""
Execute independent validation against Gurreri et al. (2017) and Long et al. (2018).
"""
import sys
import os
import json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.validation import validate_against_gurreri_2017, compare_with_long_2018


def main():
    print("=" * 70)
    print("RUNNING INDEPENDENT VALIDATION SUITE")
    print("=" * 70)

    # 1. Gurreri et al. (2017)
    g_res = validate_against_gurreri_2017()
    print("\n--- Gurreri et al. (2017) Baseline Validation ---")
    for c in g_res['comparisons']:
        status = "PASS" if c.passed else "FAIL"
        print(f"[{status}] {c.parameter_name}: sim={c.simulated_value:.4f} {c.unit}, "
              f"published={c.published_value:.4f} {c.unit} (err={c.relative_error*100:.2f}%)")

    # 2. Long et al. (2018)
    l_res = compare_with_long_2018()
    print("\n--- Long et al. (2018) Comparison (Concentration Polarization Effect) ---")
    print(f"Spatial CFD OCV:    {l_res['ocv_spatial']*1000:.2f} mV")
    print(f"Lumped Model OCV:   {l_res['ocv_lumped']*1000:.2f} mV")
    print(f"Spatial Resistance: {l_res['r_int_spatial']*1e4:.2f} Ohm*cm2")
    print(f"Lumped Resistance:  {l_res['r_int_lumped']*1e4:.2f} Ohm*cm2")
    print(f"Notes: {l_res['notes']}")

    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'results', 'validation'))
    os.makedirs(output_dir, exist_ok=True)
    summary_data = {
        'gurreri_validation': [
            {
                'parameter': str(c.parameter_name),
                'published': float(c.published_value),
                'simulated': float(c.simulated_value),
                'unit': str(c.unit),
                'rel_error': float(c.relative_error),
                'passed': bool(c.passed)
            }
            for c in g_res['comparisons']
        ],
        'long_comparison': {
            'ocv_spatial_V': float(l_res['ocv_spatial']),
            'ocv_lumped_V': float(l_res['ocv_lumped']),
            'r_spatial_Ohm_m2': float(l_res['r_int_spatial']),
            'r_lumped_Ohm_m2': float(l_res['r_int_lumped']),
            'notes': str(l_res['notes'])
        }
    }
    out_file = os.path.join(output_dir, 'validation_summary.json')
    with open(out_file, 'w') as f:
        json.dump(summary_data, f, indent=2)
    print(f"\nValidation summary written to: {out_file}")


if __name__ == '__main__':
    main()
