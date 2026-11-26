"""
Dataset writer and metadata exporter for RED reference simulations.

Stores converged reference solutions in standardized scientific formats:
1. Spatial fields: Compressed NumPy archives (.npz) containing 2D arrays:
   x, y, region_id, u, v, p, c_Na, c_Cl, phi, Jx, Jy
2. Case-level scalar outputs: CSV and JSON records
3. Global dataset manifest: Machine-readable JSON specification
4. Scaling indicators: Separate geochemical CSV table
5. Failure logs: Audited CSV recording any unconverged runs

Format is optimized for direct ingestion by Physics-Informed Neural Network (PINN)
architectures (PyTorch, TensorFlow, DeepXDE).
"""

import os
import json
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional

from src.reference_simulator import SimulationResult
from src.scaling_indicator import InterfaceScalingProfile


def export_case_spatial_fields_npz(
    result: SimulationResult,
    output_dir: str
) -> str:
    """
    Save complete 2D spatial solution fields for both channels in a compressed NPZ.

    Parameters
    ----------
    result : SimulationResult
        Converged simulation output
    output_dir : str
        Directory to store the file

    Returns
    -------
    str
        File path of exported NPZ
    """
    os.makedirs(output_dir, exist_ok=True)
    filename = f"{result.config.case_id}_fields.npz"
    filepath = os.path.join(output_dir, filename)

    # Concentrated channel fields (region_id = 1)
    # Dilute channel fields (region_id = 0)
    np.savez_compressed(
        filepath,
        # Concentrated channel coordinates and fields
        x_conc=result.geometry.concentrated.X,
        y_conc=result.geometry.concentrated.Y_global,
        region_conc=np.ones_like(result.c_conc, dtype=np.int32),
        u_conc=result.flow_conc.u,
        v_conc=result.flow_conc.v,
        p_conc=result.flow_conc.p,
        c_na_conc=result.c_conc,
        c_cl_conc=result.c_conc,
        phi_conc=result.phi_conc,

        # Dilute channel coordinates and fields
        x_dil=result.geometry.dilute.X,
        y_dil=result.geometry.dilute.Y_global,
        region_dil=np.zeros_like(result.c_dil, dtype=np.int32),
        u_dil=result.flow_dil.u,
        v_dil=result.flow_dil.v,
        p_dil=result.flow_dil.p,
        c_na_dil=result.c_dil,
        c_cl_dil=result.c_dil,
        phi_dil=result.phi_dil,

        # Membrane interface profiles (along x)
        x_interface=result.geometry.concentrated.x,
        cem_E_membrane=result.membrane_profiles['cem']['E_membrane'],
        aem_E_membrane=result.membrane_profiles['aem']['E_membrane'],
        E_cell_pair=result.membrane_profiles['E_cell_pair'],
        cem_alpha_conc=result.membrane_profiles['cem']['permselectivity_conc'],
        cem_alpha_dil=result.membrane_profiles['cem']['permselectivity_dil'],
    )
    return filepath


def build_case_metadata_dict(
    result: SimulationResult,
    scaling_data: Optional[Dict[str, InterfaceScalingProfile]] = None
) -> Dict[str, Any]:
    """Compile comprehensive case-level tabular metadata."""
    cfg = result.config
    elec = result.electrical

    meta = {
        'case_id': cfg.case_id,
        'converged': bool(result.converged),
        'iterations': int(result.coupling_iterations),
        'wall_time_s': float(result.wall_time_seconds),
        'nx': int(cfg.nx),
        'ny': int(cfg.ny),
        'dx_um': float(result.geometry.concentrated.dx * 1e6),
        'dy_um': float(result.geometry.concentrated.dy * 1e6),

        # Input Parameters
        'channel_height_um': float(cfg.channel_height * 1e6),
        'channel_length_cm': float(cfg.channel_length * 1e2),
        'c_conc_inlet_mol_m3': float(cfg.c_conc_inlet),
        'c_dil_inlet_mol_m3': float(cfg.c_dil_inlet),
        'u_mean_conc_m_s': float(cfg.u_mean_conc),
        'u_mean_dil_m_s': float(cfg.u_mean_dil),
        'temperature_K': float(cfg.T),
        'X_cem_mol_m3': float(cfg.X_cem),
        'X_aem_mol_m3': float(cfg.X_aem),

        # Hydrodynamics
        'Re_conc': float(result.flow_conc.Re),
        'Re_dil': float(result.flow_dil.Re),
        'delta_p_conc_Pa': float(result.flow_conc.delta_p),
        'delta_p_dil_Pa': float(result.flow_dil.delta_p),

        # Conservation residuals
        'mass_balance_rel_err_conc': float(result.mass_balance_conc['relative_error']),
        'mass_balance_rel_err_dil': float(result.mass_balance_dil['relative_error']),

        # Electrical Outputs
        'ocv_mV': float(elec.E_ocv * 1000.0),
        'R_internal_Ohm_cm2': float(elec.R_internal * 1e4),
        'R_conc_Ohm_cm2': float(elec.R_conc * 1e4),
        'R_dil_Ohm_cm2': float(elec.R_dil * 1e4),
        'R_mem_Ohm_cm2': float((elec.R_cem + elec.R_aem) * 1e4),
        'P_gross_max_W_m2': float(elec.P_gross_max),
        'P_pump_total_W_m2': float(elec.P_pump_total),
        'P_net_max_W_m2': float(elec.P_net_max),
        'permselectivity_cem': float(elec.alpha_cem),
        'permselectivity_aem': float(elec.alpha_aem),
    }

    if scaling_data is not None:
        meta['scaling_cem_max_SI'] = float(scaling_data['cem_conc'].max_si)
        meta['scaling_cem_supersaturated'] = bool(scaling_data['cem_conc'].is_supersaturated)
    else:
        meta['scaling_cem_max_SI'] = None
        meta['scaling_cem_supersaturated'] = None

    return meta


def export_dataset(
    results: List[SimulationResult],
    scaling_dict_list: List[Optional[Dict[str, InterfaceScalingProfile]]],
    failed_configs: List[Dict[str, Any]],
    output_dir: str
) -> Dict[str, str]:
    """
    Export all case metadata, manifest, and failure logs.

    Parameters
    ----------
    results : List[SimulationResult]
        All executed simulation results
    scaling_dict_list : List
        Corresponding scaling profiles
    failed_configs : List
        Any runs that failed or did not converge
    output_dir : str
        Base output directory

    Returns
    -------
    Dict[str, str]
        Paths of generated dataset files
    """
    metadata_dir = os.path.join(output_dir, "metadata")
    generated_dir = os.path.join(output_dir, "generated")
    os.makedirs(metadata_dir, exist_ok=True)
    os.makedirs(generated_dir, exist_ok=True)

    metadata_records = []
    for res, sc in zip(results, scaling_dict_list):
        # Save spatial fields
        export_case_spatial_fields_npz(res, generated_dir)
        # Compile metadata
        meta = build_case_metadata_dict(res, sc)
        metadata_records.append(meta)

    # 1. Export CSV Table
    df = pd.DataFrame(metadata_records)
    csv_path = os.path.join(metadata_dir, "case_metadata.csv")
    df.to_csv(csv_path, index=False)

    # 2. Export Failure Log
    failure_csv_path = os.path.join(metadata_dir, "failure_log.csv")
    if failed_configs:
        fail_df = pd.DataFrame(failed_configs)
        fail_df.to_csv(failure_csv_path, index=False)
    else:
        # Create empty failure log with headers
        fail_df = pd.DataFrame(columns=['case_id', 'reason', 'error_detail'])
        fail_df.to_csv(failure_csv_path, index=False)

    # 3. Export Manifest JSON
    manifest = {
        'dataset_title': "REDMind Reverse Electrodialysis Reference Training Dataset",
        'version': "1.0.0",
        'model_type': "2D Navier-Stokes + Nernst-Planck + Donnan Equilibrium Cell Pair",
        'primary_reference': "Gurreri et al. (2017), Desalination, 423, 52-64",
        'intended_use': "Physics-Informed Neural Network (PINN) training and validation",
        'num_converged_cases': len(results),
        'num_failed_cases': len(failed_configs),
        'spatial_field_format': "Compressed NumPy (.npz) 2D Arrays",
        'metadata_format': "CSV (case_metadata.csv)",
        'spatial_fields': [
            'x_conc', 'y_conc', 'region_conc', 'u_conc', 'v_conc', 'p_conc',
            'c_na_conc', 'c_cl_conc', 'phi_conc',
            'x_dil', 'y_dil', 'region_dil', 'u_dil', 'v_dil', 'p_dil',
            'c_na_dil', 'c_cl_dil', 'phi_dil',
            'x_interface', 'cem_E_membrane', 'aem_E_membrane', 'E_cell_pair',
            'cem_alpha_conc', 'cem_alpha_dil'
        ],
        'units': {
            'x, y': "m",
            'u, v': "m/s",
            'p': "Pa",
            'c_na, c_cl': "mol/m3",
            'phi': "V",
            'E_membrane, E_cell_pair': "V",
            'P_gross, P_net, P_pump': "W/m2",
            'R_internal': "Ohm*m2"
        }
    }
    manifest_path = os.path.join(metadata_dir, "manifest.json")
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    return {
        'metadata_csv': csv_path,
        'manifest_json': manifest_path,
        'failure_log': failure_csv_path
    }
