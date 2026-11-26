import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, FileCode2, FileText, Search } from 'lucide-react';
import { MarkdownView } from '../components/MarkdownView';

interface MaterialGroup {
  id: string;
  title: string;
  files: string[];
}

interface MaterialsCatalog {
  groups: MaterialGroup[];
  parameterProvenance: {
    headers: string[];
    rows: Array<Record<string, string>>;
  };
}

export const MaterialsView: React.FC = () => {
  const [catalog, setCatalog] = useState<MaterialsCatalog | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>('README.md');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileExt, setFileExt] = useState<string>('.md');
  const [loadingFile, setLoadingFile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [provFilter, setProvFilter] = useState('');

  useEffect(() => {
    fetch('/api/materials')
      .then((r) => r.json())
      .then((d: MaterialsCatalog) => setCatalog(d));
  }, []);

  useEffect(() => {
    if (selectedPath === '__provenance__') return;
    let cancelled = false;
    setLoadingFile(true);
    fetch(`/api/materials/file?path=${encodeURIComponent(selectedPath)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setFileContent(d.content ?? '');
          setFileExt(d.ext ?? '.txt');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  const filteredProvenance = useMemo(() => {
    if (!catalog) return [];
    const q = provFilter.trim().toLowerCase();
    if (!q) return catalog.parameterProvenance.rows;
    return catalog.parameterProvenance.rows.filter((r) =>
      Object.values(r).some((v) => v.toLowerCase().includes(q))
    );
  }, [catalog, provFilter]);

  const handleCopy = () => {
    if (!fileContent) return;
    navigator.clipboard?.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      {/* Left Navigation Tree */}
      <aside className="w-full lg:w-[300px] shrink-0 border border-[#1C2536] bg-[#0E131D] rounded p-3 space-y-4 max-h-[75vh] overflow-y-auto">
        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
            Audit Ledger
          </div>
          <button
            type="button"
            onClick={() => setSelectedPath('__provenance__')}
            className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-2 transition-colors ${
              selectedPath === '__provenance__'
                ? 'bg-[#131A27] text-cyan-300 border border-cyan-500/40'
                : 'text-slate-300 hover:bg-[#131A27]/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Parameter Provenance Table</span>
          </button>
        </div>

        {catalog?.groups.map((grp) => (
          <div key={grp.id}>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
              {grp.title}
            </div>
            <div className="space-y-0.5">
              {grp.files.map((fp) => {
                const isCode =
                  fp.endsWith('.py') ||
                  fp.endsWith('.yaml') ||
                  fp.endsWith('.json');
                return (
                  <button
                    key={fp}
                    type="button"
                    onClick={() => setSelectedPath(fp)}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                      selectedPath === fp
                        ? 'bg-[#131A27] text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-300 hover:bg-[#131A27]/60'
                    }`}
                  >
                    {isCode ? (
                      <FileCode2 className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    )}
                    <span className="truncate font-mono text-[11px]">{fp}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      {/* Right Reader Panel */}
      <section className="flex-1 min-w-0 border border-[#1C2536] bg-[#0E131D] rounded p-5 min-h-[600px]">
        {selectedPath === '__provenance__' && catalog ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C2536] pb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  Parameter Provenance Ledger (reports/parameter_provenance.csv)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Every physical constant, membrane property, and thermodynamic parameter documented with literature citation and exact code location.
                </p>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={provFilter}
                  onChange={(e) => setProvFilter(e.target.value)}
                  placeholder="Filter parameters..."
                  className="bg-[#080B11] border border-[#2C3A52] rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="overflow-x-auto border border-[#1C2536] rounded max-h-[65vh]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#131A27] sticky top-0 border-b border-[#1C2536] text-slate-300">
                  <tr>
                    {catalog.parameterProvenance.headers.map((h) => (
                      <th key={h} className="py-2.5 px-3 font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1C2536]/70">
                  {filteredProvenance.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#131A27]/50">
                      {catalog.parameterProvenance.headers.map((h) => (
                        <td
                          key={h}
                          className="py-2 px-3 text-slate-300 font-mono tabular-nums align-top"
                        >
                          {row[h] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 border-b border-[#1C2536] pb-3">
              <div className="font-mono text-xs text-cyan-300 truncate">
                {selectedPath}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-[#2C3A52] bg-[#131A27] text-slate-200 hover:bg-[#1C2536] whitespace-nowrap shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy File
                  </>
                )}
              </button>
            </div>

            {loadingFile ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Reading {selectedPath}...
              </div>
            ) : fileExt === '.md' ? (
              <MarkdownView content={fileContent} />
            ) : (
              <pre className="p-4 rounded border border-[#1C2536] bg-[#080B11] text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed max-h-[68vh]">
                {fileContent}
              </pre>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
