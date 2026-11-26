import React, { useEffect, useState } from 'react';
import { Play, Terminal } from 'lucide-react';
import { CommandRunResult } from '../types';

interface VerificationViewProps {
  verificationSummary: Array<{
    test_id: number;
    name: string;
    passed: boolean;
    summary: string;
  }>;
  validationSummary: {
    gurreri_validation: Array<{
      parameter: string;
      published: number;
      simulated: number;
      unit: string;
      rel_error: number;
      passed: boolean;
    }>;
    long_comparison: {
      ocv_spatial_V: number;
      ocv_lumped_V: number;
      r_spatial_Ohm_m2: number;
      r_lumped_Ohm_m2: number;
      notes: string;
    };
  } | null;
  baselineComparison: {
    n_compared: number;
    max_abs_diff_ocv_mV: number;
    mean_abs_diff_ocv_mV: number;
    max_abs_diff_P_gross_W_m2: number;
    orig_max_mb_dil: number;
    repaired_max_mb_dil: number;
    baseline_case_000: {
      orig_ocv_mV: number;
      repaired_ocv_mV: number;
      orig_P_gross_W_m2: number;
      repaired_P_gross_W_m2: number;
    };
  } | null;
  autoRunCommandId?: string | null;
  onClearAutoRun?: () => void;
}

const COMMANDS = [
  {
    id: 'verification_suite',
    cli: 'run_verification.py',
    title: 'Mandatory 10-Test Physics Verification Suite',
    desc: 'Executes live Poiseuille benchmark, mass balance, inlet/outlet BCs, membrane flux consistency, electroneutrality, positivity, units, zero-gradient limit, 3-grid convergence, and 6-point stability.',
  },
  {
    id: 'validation_suite',
    cli: 'run_validation.py',
    title: 'Literature Validation (Gurreri 2017 & Long 2018)',
    desc: 'Compares live 2D cell-pair simulation against Gurreri et al. (2017) OCV/ΔP/Power benchmarks and Long et al. (2018) lumped polarization model.',
  },
  {
    id: 'pitzer_benchmarks',
    cli: 'pytest tests/test_pitzer_model.py tests/test_nucleation.py',
    title: 'Pitzer Activity, Gypsum Salting-In & CNT Benchmarks',
    desc: 'Verifies Robinson & Stokes NaCl γ± (0.1–4.0 m), high-salinity gypsum salting-in vs Davies divergence, and Santoro et al. (2021) Calcite CNT barriers.',
  },
  {
    id: 'baseline_audit',
    cli: 'audit_v1_vs_v2_baseline.py',
    title: 'v1.0.0 Original vs v2.0.0 Repaired 51-Case Audit',
    desc: 'Runs live v1 (+J) vs v2 (-J) CEM BC check alongside on-disk original_51_cases vs repaired_baseline_51 NPZ verification.',
  },
];

export const VerificationView: React.FC<VerificationViewProps> = ({
  verificationSummary,
  validationSummary,
  baselineComparison,
  autoRunCommandId,
  onClearAutoRun,
}) => {
  const [runningCmd, setRunningCmd] = useState<string | null>(null);
  const [activeResult, setActiveResult] = useState<CommandRunResult | null>(
    null
  );
  const [cmdError, setCmdError] = useState<string | null>(null);

  const runCommand = async (commandId: string) => {
    setRunningCmd(commandId);
    setCmdError(null);
    try {
      const res = await fetch('/api/commands/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as CommandRunResult;
      setActiveResult(data);
    } catch (err) {
      setCmdError(
        err instanceof Error ? err.message : 'Command execution failed'
      );
    } finally {
      setRunningCmd(null);
    }
  };

  useEffect(() => {
    if (autoRunCommandId) {
      runCommand(autoRunCommandId);
      onClearAutoRun?.();
    }
  }, [autoRunCommandId, onClearAutoRun]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1C2536] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">
            Executable Verification &amp; Literature Validation Deck
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            Run live physics checks, literature comparisons, Pitzer/CNT benchmarks, and v1.0.0-to-v2.0.0 baseline audits directly against the REDMind v2.1.0 solver and on-disk archives.
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-slate-400">
          Saved Suite: {verificationSummary.filter((t) => t.passed).length}/
          {verificationSummary.length} Passed · Gurreri 2017 &amp; Long 2018 Verified
        </div>
      </div>

      {/* Command Execution Deck */}
      <div className="grid grid-cols-1 md:grid-cols-2 border border-[#1C2536] bg-[#0E131D] rounded divide-y md:divide-y-0 md:divide-x divide-[#1C2536]">
        <div className="divide-y divide-[#1C2536]">
          {COMMANDS.slice(0, 2).map((cmd) => (
            <CommandCell
              key={cmd.id}
              cmd={cmd}
              isRunning={runningCmd === cmd.id}
              disabled={runningCmd !== null}
              onRun={() => runCommand(cmd.id)}
            />
          ))}
        </div>
        <div className="divide-y divide-[#1C2536]">
          {COMMANDS.slice(2, 4).map((cmd) => (
            <CommandCell
              key={cmd.id}
              cmd={cmd}
              isRunning={runningCmd === cmd.id}
              disabled={runningCmd !== null}
              onRun={() => runCommand(cmd.id)}
            />
          ))}
        </div>
      </div>

      {cmdError && (
        <div className="border border-rose-500/40 bg-rose-950/30 text-rose-200 px-4 py-3 rounded text-xs">
          ✖ {cmdError}
        </div>
      )}

      {/* Live Execution Output Panel */}
      {activeResult && (
        <div className="border border-[#2C3A52] bg-[#0E131D] rounded overflow-hidden">
          <div className="px-4 py-3 bg-[#131A27] border-b border-[#1C2536] flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-mono text-slate-400">
                Live Execution Output · {activeResult.totalDurationMs.toFixed(1)} ms
              </div>
              <h2 className="text-base font-semibold text-slate-100">
                {activeResult.title}
              </h2>
            </div>
            <div
              className={`text-xs font-mono font-semibold ${
                activeResult.passed ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {activeResult.passed ? '● ALL CHECKS PASSED' : '✖ SOME CHECKS FAILED'}
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className="overflow-x-auto border border-[#1C2536] rounded">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#080B11] border-b border-[#1C2536] text-slate-300">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Check</th>
                    <th className="py-2.5 px-3 font-semibold">Outcome</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Time</th>
                    <th className="py-2.5 px-3 font-semibold">Computed Result Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C2536]/80">
                  {activeResult.items.map((it) => (
                    <tr key={it.id} className="hover:bg-[#131A27]/50">
                      <td className="py-2 px-3 font-medium text-slate-100">
                        {it.name}
                      </td>
                      <td
                        className={`py-2 px-3 font-mono whitespace-nowrap ${
                          it.passed ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {it.passed ? '● Pass' : '✖ Fail'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                        {it.durationMs.toFixed(1)} ms
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums text-slate-300">
                        {it.summary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                Command Console Output
              </div>
              <pre className="p-3 rounded border border-[#1C2536] bg-[#080B11] text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed">
                {activeResult.stdout.join('\n')}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Pre-computed Reference Audit & Literature Summaries */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden">
          <div className="px-4 py-2.5 bg-[#131A27] border-b border-[#1C2536]">
            <h3 className="text-sm font-semibold text-slate-100">
              Saved Verification Record (verification_summary.json)
            </h3>
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="border-b border-[#1C2536] text-slate-400">
                <tr>
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Verification Test</th>
                  <th className="py-2 pr-3">Result</th>
                  <th className="py-2">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C2536]/70">
                {verificationSummary.map((t) => (
                  <tr key={t.test_id}>
                    <td className="py-2 pr-3 font-mono tabular-nums text-slate-500">
                      {t.test_id}
                    </td>
                    <td className="py-2 pr-3 font-medium text-slate-200 whitespace-nowrap">
                      {t.name}
                    </td>
                    <td
                      className={`py-2 pr-3 font-mono whitespace-nowrap ${
                        t.passed ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {t.passed ? '● Pass' : '✖ Fail'}
                    </td>
                    <td className="py-2 font-mono tabular-nums text-slate-400">
                      {t.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          {validationSummary && (
            <div className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden">
              <div className="px-4 py-2.5 bg-[#131A27] border-b border-[#1C2536]">
                <h3 className="text-sm font-semibold text-slate-100">
                  Literature Validation Record (Gurreri 2017 &amp; Long 2018)
                </h3>
              </div>
              <div className="p-4">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="border-b border-[#1C2536] text-slate-400">
                    <tr>
                      <th className="py-2 pr-3">Parameter</th>
                      <th className="py-2 pr-3 text-right">Published</th>
                      <th className="py-2 pr-3 text-right">Simulated</th>
                      <th className="py-2 pr-3 text-right">Rel. Error</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1C2536]/70 font-mono tabular-nums">
                    {validationSummary.gurreri_validation.map((row) => (
                      <tr key={row.parameter}>
                        <td className="py-2 pr-3 font-sans text-slate-200">
                          {row.parameter}
                        </td>
                        <td className="py-2 pr-3 text-right text-slate-300">
                          {row.published.toFixed(3)} {row.unit}
                        </td>
                        <td className="py-2 pr-3 text-right text-cyan-300">
                          {row.simulated.toFixed(4)} {row.unit}
                        </td>
                        <td className="py-2 pr-3 text-right text-slate-300">
                          {(row.rel_error * 100).toFixed(3)}%
                        </td>
                        <td className="py-2 text-emerald-400">
                          {row.passed ? '● Pass' : '✖ Fail'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-slate-400 leading-relaxed">
                  {validationSummary.long_comparison.notes}
                </p>
              </div>
            </div>
          )}

          {baselineComparison && (
            <div className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden">
              <div className="px-4 py-2.5 bg-[#131A27] border-b border-[#1C2536]">
                <h3 className="text-sm font-semibold text-slate-100">
                  v1.0.0 Original vs v2.0.0 Repaired Baseline ({baselineComparison.n_compared} Cases)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#1C2536] text-xs font-mono tabular-nums">
                <div className="p-3.5">
                  <div className="text-[11px] font-sans text-slate-400">
                    Max Dilute Mass Err (v1 → v2)
                  </div>
                  <div className="mt-1 text-cyan-300 font-semibold">
                    {(baselineComparison.orig_max_mb_dil * 100).toFixed(2)}% →{' '}
                    {(baselineComparison.repaired_max_mb_dil * 100).toFixed(3)}%
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="text-[11px] font-sans text-slate-400">
                    Case 000 OCV (v1 → v2)
                  </div>
                  <div className="mt-1 text-slate-100 font-semibold">
                    {baselineComparison.baseline_case_000.orig_ocv_mV.toFixed(2)} →{' '}
                    {baselineComparison.baseline_case_000.repaired_ocv_mV.toFixed(2)} mV
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="text-[11px] font-sans text-slate-400">
                    Max ΔP_gross (51 cases)
                  </div>
                  <div className="mt-1 text-amber-300 font-semibold">
                    {baselineComparison.max_abs_diff_P_gross_W_m2.toFixed(3)} W/m²
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CommandCell: React.FC<{
  cmd: (typeof COMMANDS)[number];
  isRunning: boolean;
  disabled: boolean;
  onRun: () => void;
}> = ({ cmd, isRunning, disabled, onRun }) => (
  <div className="p-4 flex flex-col justify-between gap-3">
    <div>
      <div className="text-xs font-mono text-cyan-400 mb-1">{cmd.cli}</div>
      <h3 className="text-sm font-semibold text-slate-100">{cmd.title}</h3>
      <p className="mt-1 text-xs text-slate-400 leading-relaxed">{cmd.desc}</p>
    </div>
    <div className="flex items-center justify-end">
      <button
        type="button"
        disabled={disabled}
        onClick={onRun}
        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded border border-cyan-500/50 bg-[#131A27] hover:bg-cyan-400 hover:text-slate-950 text-cyan-300 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
      >
        <Play className="w-3 h-3 fill-current" />
        {isRunning ? 'Executing...' : 'Execute'}
      </button>
    </div>
  </div>
);
