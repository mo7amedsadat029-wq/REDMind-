import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Download,
  FolderArchive,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  DatasetCatalogItem,
  DatasetCatalogPayload,
  DatasetCategory,
} from '../types';

interface AllDatasetsViewProps {
  onOpenFolder: (category: DatasetCategory) => void;
}

type GroupFilter =
  | 'all'
  | 'pinn_8ion'
  | 'binary_nacl'
  | 'thermo_bench'
  | 'legacy_audit';

function formatBytesMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) return `${mb.toFixed(1)} MB`;
  if (mb >= 0.1) return `${mb.toFixed(2)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

function toneClass(tone: DatasetCatalogItem['statusTone']): string {
  switch (tone) {
    case 'verified':
      return 'text-emerald-400';
    case 'thermo':
      return 'text-cyan-300';
    case 'exploratory':
      return 'text-amber-400';
    case 'legacy':
    default:
      return 'text-slate-400';
  }
}

export const AllDatasetsView: React.FC<AllDatasetsViewProps> = ({
  onOpenFolder,
}) => {
  const [catalog, setCatalog] = useState<DatasetCatalogPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [search, setSearch] = useState<string>('');
  const [activeDownload, setActiveDownload] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [readyBlob, setReadyBlob] = useState<{
    url: string;
    filename: string;
    sizeMB: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadCatalog = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/datasets/catalog');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as DatasetCatalogPayload;
        if (!cancelled) setCatalog(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load dataset catalog'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  const pinnSobolItem = useMemo(
    () => catalog?.items.find((it) => it.id === 'pinn_8ion_sobol') ?? null,
    [catalog]
  );

  const filteredItems = useMemo(() => {
    if (!catalog) return [];
    const q = search.trim().toLowerCase();
    return catalog.items.filter((item) => {
      if (groupFilter !== 'all' && item.group !== groupFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.relPath.toLowerCase().includes(q) ||
        item.physicsModel.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q) ||
        item.statusLabel.toLowerCase().includes(q)
      );
    });
  }, [catalog, groupFilter, search]);

  const totalFiles = useMemo(
    () => (catalog ? catalog.items.reduce((s, i) => s + i.fileCount, 0) : 0),
    [catalog]
  );

  const totalNpz = useMemo(
    () => (catalog ? catalog.items.reduce((s, i) => s + i.npzCount, 0) : 0),
    [catalog]
  );

  const triggerDownload = async (
    url: string,
    label: string,
    fallbackName = 'redmind_bundle.zip'
  ) => {
    setActiveDownload(label);
    setDownloadError(null);
    if (readyBlob) {
      URL.revokeObjectURL(readyBlob.url);
      setReadyBlob(null);
    }
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Download failed (HTTP ${res.status})`);
      }
      const ctype = res.headers.get('content-type') ?? '';
      if (ctype.includes('text/html')) {
        throw new Error(
          'Proxy returned HTML instead of ZIP (exceeded limit or session expired). Try the Part 1 / Part 2 buttons.'
        );
      }
      const disp = res.headers.get('content-disposition') ?? '';
      const match = /filename="([^"]+)"/i.exec(disp);
      const filename = match ? match[1] : fallbackName;

      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      setReadyBlob({
        url: objUrl,
        filename,
        sizeMB: formatBytesMB(blob.size),
      });

      const link = document.createElement('a');
      link.href = objUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : `Failed to download ${label}`
      );
    } finally {
      setActiveDownload((cur) => (cur === label ? null : cur));
    }
  };

  const filterButtons: Array<{ id: GroupFilter; label: string }> = [
    { id: 'all', label: 'All Folders' },
    { id: 'pinn_8ion', label: 'PINN-Ready (8-Ion)' },
    { id: 'binary_nacl', label: '2-Ion NaCl' },
    { id: 'thermo_bench', label: 'Thermodynamic & Benchmarks' },
    { id: 'legacy_audit', label: 'Legacy & Audit Logs' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header & Bulk 1-Click Export Controls */}
      <section className="bg-[#0E131D] border border-[#1C2536] rounded p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-mono uppercase tracking-wider text-cyan-400">
              REDMind v2.1.0 · Unified Corpus &amp; Bulk Archive
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-50 font-display">
              All Datasets &amp; 1-Click Bulk Export
            </h1>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Every verified PDE dataset, geochemical saturation profile, benchmark table, failure audit log, and historical v1.0.0 archive packaged together in a single structured <span className="font-mono text-slate-200">.zip</span> archive—with strict folder boundaries and a root <span className="font-mono text-slate-200">BUNDLE_MANIFEST.json</span> so incompatible regimes are never flattened into one unlabelled CSV.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5 shrink-0">
            <button
              type="button"
              disabled={!catalog || activeDownload !== null}
              onClick={() =>
                triggerDownload(
                  '/api/datasets/download/bundle?scope=all',
                  'Complete Corpus (.zip)',
                  'redmind_all_datasets_v2.1.0.zip'
                )
              }
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>
                Download All Datasets (.zip)
                {catalog ? ` · ${formatBytesMB(catalog.totalBytes)}` : ''}
              </span>
            </button>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {pinnSobolItem && pinnSobolItem.npzCount > 140 ? (
                <>
                  <button
                    type="button"
                    disabled={!catalog || activeDownload !== null}
                    onClick={() =>
                      triggerDownload(
                        '/api/datasets/download/bundle?scope=pinn_8ion_part1',
                        '8-Ion PINN Part 1 (001–140)',
                        'redmind_pinn_8ion_part1_001_140.zip'
                      )
                    }
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded bg-[#131A27] hover:bg-[#182234] border border-[#2C3A52] disabled:opacity-50 text-emerald-300 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <FolderArchive className="w-3.5 h-3.5 shrink-0" />
                    <span>8-Ion PINN Part 1 (001–140 .zip)</span>
                  </button>
                  <button
                    type="button"
                    disabled={!catalog || activeDownload !== null}
                    onClick={() =>
                      triggerDownload(
                        '/api/datasets/download/bundle?scope=pinn_8ion_part2',
                        '8-Ion PINN Part 2 (141–275)',
                        'redmind_pinn_8ion_part2_141_275.zip'
                      )
                    }
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded bg-[#131A27] hover:bg-[#182234] border border-[#2C3A52] disabled:opacity-50 text-emerald-300 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <FolderArchive className="w-3.5 h-3.5 shrink-0" />
                    <span>8-Ion PINN Part 2 (141–275 .zip)</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={!catalog || activeDownload !== null}
                  onClick={() =>
                    triggerDownload(
                      '/api/datasets/download/bundle?scope=pinn_8ion',
                      'Verified 8-Ion PINN Bundle (.zip)',
                      'redmind_pinn_8ion_verified_316_runs.zip'
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded bg-[#131A27] hover:bg-[#182234] border border-[#2C3A52] disabled:opacity-50 text-emerald-300 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FolderArchive className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    8-Ion PINN Bundle (.zip)
                    {catalog
                      ? ` · ${catalog.pinnCases} runs · ${formatBytesMB(catalog.pinnBytes)}`
                      : ''}
                  </span>
                </button>
              )}

              <button
                type="button"
                disabled={!catalog || activeDownload !== null}
                onClick={() =>
                  triggerDownload(
                    '/api/datasets/download/bundle?scope=csv_only',
                    'Metadata CSVs & JSON (.zip)',
                    'redmind_all_metadata_csv_json.zip'
                  )
                }
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded bg-[#131A27] hover:bg-[#182234] border border-[#1C2536] hover:border-[#2C3A52] disabled:opacity-50 text-slate-200 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                <span>Metadata CSVs &amp; JSON (.zip)</span>
              </button>
            </div>

            {activeDownload && (
              <p className="text-xs font-mono text-cyan-300">
                Preparing archive: {activeDownload}...
              </p>
            )}
            {readyBlob && (
              <a
                href={readyBlob.url}
                download={readyBlob.filename}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 text-xs font-mono transition-colors"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Ready ({readyBlob.sizeMB}): Click to save {readyBlob.filename}
                </span>
              </a>
            )}
            {downloadError && (
              <p className="text-xs font-mono text-rose-300 max-w-md text-right">
                ✖ {downloadError}
              </p>
            )}
          </div>
        </div>

        {/* 4-Column Tabular Telemetry Strip */}
        <div className="mt-6 pt-5 border-t border-[#1C2536] grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#080B11] border border-[#1C2536] rounded px-4 py-3">
            <div className="text-xs text-slate-400">Dataset Folders</div>
            <div className="mt-1 text-xl font-semibold text-slate-100 font-mono tabular-nums">
              {catalog ? catalog.folderCount : '—'}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
              {catalog ? `${totalFiles} total files` : 'Scanning disk...'}
            </div>
          </div>

          <div className="bg-[#080B11] border border-[#1C2536] rounded px-4 py-3">
            <div className="text-xs text-slate-400">Verified 8-Ion PINN Runs</div>
            <div className="mt-1 text-xl font-semibold text-emerald-400 font-mono tabular-nums">
              {catalog ? catalog.pinnCases : '—'}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
              Stage 2A (41) + Stage 2B (275)
            </div>
          </div>

          <div className="bg-[#080B11] border border-[#1C2536] rounded px-4 py-3">
            <div className="text-xs text-slate-400">Total On-Disk Corpus</div>
            <div className="mt-1 text-xl font-semibold text-cyan-300 font-mono tabular-nums">
              {catalog ? formatBytesMB(catalog.totalBytes) : '—'}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
              {catalog ? `${totalNpz} NPZ binary field archives` : 'Calculating...'}
            </div>
          </div>

          <div className="bg-[#080B11] border border-[#1C2536] rounded px-4 py-3">
            <div className="text-xs text-slate-400">All Verified PDE Runs</div>
            <div className="mt-1 text-xl font-semibold text-slate-100 font-mono tabular-nums">
              {catalog ? catalog.verifiedCases : '—'}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
              8-Ion (316) + 2-Ion NaCl (136)
            </div>
          </div>
        </div>
      </section>

      {/* Scientific Integrity Boundary Note */}
      <section className="bg-[#0E131D] border border-[#1C2536] rounded px-5 py-4 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <span className="font-semibold text-slate-100">
            Scientific Regime Isolation:
          </span>{' '}
          The 1-click <span className="font-mono text-slate-200">Complete Archive</span> preserves each folder separately and includes a machine-readable <span className="font-mono text-slate-200">BUNDLE_MANIFEST.json</span>. Historical v1.0.0 runs (<span className="font-mono text-slate-200">original_51_cases</span> with the legacy <span className="font-mono text-slate-200">+J</span> bug), non-converged candidate logs (<span className="font-mono text-slate-200">failure_log.csv</span>), binary NaCl runs (<span className="font-mono text-slate-200">clean_cases</span>, <span className="font-mono text-slate-200">repaired_baseline_51</span>), and exploratory prescribed <span className="font-mono text-slate-200">ΔR_m</span> runs (<span className="font-mono text-slate-200">mineral_scaling</span>) are strictly excluded from the <span className="font-mono text-emerald-300">8-Ion PINN Bundle</span>.
        </div>
      </section>

      {/* Filter & Search Bar */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {filterButtons.map((btn) => {
            const active = groupFilter === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => setGroupFilter(btn.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#131A27] text-cyan-300 border-[#2C3A52]'
                    : 'bg-[#0E131D] text-slate-400 border-[#1C2536] hover:text-slate-200 hover:border-[#2C3A52]'
                }`}
              >
                {btn.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-72 shrink-0">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter folders, physics, path..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0E131D] border border-[#1C2536] focus:border-[#2C3A52] rounded text-slate-100 placeholder-slate-500 focus:outline-none"
          />
        </div>
      </section>

      {/* Master Dataset Catalog Table */}
      <section className="bg-[#0E131D] border border-[#1C2536] rounded overflow-hidden">
        {loading && (
          <div className="px-6 py-12 text-center text-xs text-slate-400 font-mono">
            Scanning server dataset directories...
          </div>
        )}

        {error && !loading && (
          <div className="px-6 py-8 text-center text-xs text-rose-300 font-mono">
            ✖ Failed to load catalog: {error}
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1C2536] bg-[#080B11] text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4 font-medium">Folder &amp; Path</th>
                  <th className="py-3 px-4 font-medium">Model Scope &amp; Grid</th>
                  <th className="py-3 px-4 font-medium text-right">Records / NPZ</th>
                  <th className="py-3 px-4 font-medium text-right">Size</th>
                  <th className="py-3 px-4 font-medium">Scientific Status</th>
                  <th className="py-3 px-4 font-medium">PINN Inclusion</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C2536] text-xs">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-[#131A27]/60 transition-colors align-top"
                  >
                    <td className="py-3.5 px-4 min-w-[230px]">
                      <div className="font-medium text-slate-100">
                        {item.title}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-cyan-400/90">
                        {item.relPath}/
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400 leading-snug max-w-xs">
                        {item.notes}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 min-w-[220px]">
                      <div className="text-slate-200 leading-snug">
                        {item.physicsModel}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-slate-400">
                        {item.gridOrDim}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="text-slate-100">
                        {item.csvRows > 0 ? `${item.csvRows} rows` : `${item.fileCount} files`}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {item.npzCount > 0 ? `${item.npzCount} NPZ` : 'CSV / JSON'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap text-slate-200">
                      <div>{formatBytesMB(item.totalBytes)}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {item.fileCount} files
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`font-medium ${toneClass(item.statusTone)}`}>
                        {item.statusLabel}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 min-w-[155px]">
                      {item.pinnTrainingIncluded ? (
                        <span className="font-mono text-emerald-400 whitespace-nowrap">
                          ● Included (8-Ion)
                        </span>
                      ) : (
                        <span className="font-mono text-slate-400 whitespace-nowrap">
                          — Excluded (
                          {item.group === 'binary_nacl'
                            ? '2-Ion NaCl'
                            : item.id === 'original_51_cases'
                              ? 'Legacy v1.0'
                              : item.id === 'mineral_scaling'
                                ? '0D / ΔR_m'
                                : item.id === 'scaling_risk'
                                  ? '1D Wall SI'
                                  : 'Audit / Ref'}
                          )
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenFolder(item.explorerCategory)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#080B11] hover:bg-[#131A27] border border-[#1C2536] hover:border-[#2C3A52] text-slate-200 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <span>Explorer</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            triggerDownload(
                              `/api/datasets/download/bundle?scope=folder&folder=${encodeURIComponent(
                                item.id
                              )}`,
                              `${item.id}.zip`,
                              `redmind_${item.id}.zip`
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#131A27] hover:bg-[#182234] border border-[#2C3A52] text-cyan-300 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>.zip</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredItems.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 px-4 text-center text-xs text-slate-400"
                    >
                      No dataset folders match the active filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
