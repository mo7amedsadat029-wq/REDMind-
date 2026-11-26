"""
Execute all 10 numerical verification tests and export summary results.
"""
import sys
import os
import json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.verification import run_full_verification_suite


def main():
    results = run_full_verification_suite()
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'results', 'verification'))
    os.makedirs(output_dir, exist_ok=True)

    summary = []
    for r in results:
        summary.append({
            'test_id': int(r.test_id),
            'name': str(r.name),
            'passed': bool(r.passed),
            'summary': str(r.summary)
        })

    out_file = os.path.join(output_dir, 'verification_summary.json')
    with open(out_file, 'w') as f:
        json.dump(summary, f, indent=2)

    print(f"\nVerification summary saved to: {out_file}")


if __name__ == '__main__':
    main()
