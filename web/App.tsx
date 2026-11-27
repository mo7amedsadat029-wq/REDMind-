import React, { useEffect, useState } from 'react';
import {
  DatasetCategory,
  LibrarySubTab,
  LoadedNpzCase,
  NavTab,
  OverviewPayload,
} from './types';
import { OverviewView } from './views/OverviewView';
import { SimulatorView } from './views/SimulatorView';
import { SpecificationsView } from './views/SpecificationsView';
import { DatasetsView } from './views/DatasetsView';
import { AllDatasetsView } from './views/AllDatasetsView';
import { VerificationView } from './views/VerificationView';
import { FiguresView } from './views/FiguresView';
import { ReferencesView } from './views/ReferencesView';
import { MaterialsView } from './views/MaterialsView';
import { PinnResourcesView } from './views/PinnResourcesView';

const NAV_ITEMS: Array<{ id: NavTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'equations', label: 'Equations' },
  { id: 'datasets', label: 'Datasets' },
  { id: 'all_datasets', label: 'All Datasets' },
  { id: 'verification', label: 'Verification' },
  { id: 'library', label: 'Library' },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [datasetCategory, setDatasetCategory] =
    useState<DatasetCategory>('clean_baseline');
  const [librarySubTab, setLibrarySubTab] =
    useState<LibrarySubTab>('figures');

  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loadedNpz, setLoadedNpz] = useState<LoadedNpzCase | null>(null);
  const [autoRunVerification, setAutoRunVerification] = useState<string | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/overview')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: OverviewPayload) => setOverview(data))
      .catch((err) =>
        setLoadError(
          err instanceof Error ? err.message : 'Failed to load REDMind overview'
        )
      );
  }, []);

  const handleNavigate = (
    tab: NavTab,
    options?: {
      datasetCategory?: DatasetCategory;
      librarySubTab?: LibrarySubTab;
      autoVerify?: boolean;
    }
  ) => {
    if (options?.datasetCategory) setDatasetCategory(options.datasetCategory);
    if (options?.librarySubTab) setLibrarySubTab(options.librarySubTab);
    if (options?.autoVerify) setAutoRunVerification('verification_suite');
    setActiveTab(tab);
  };

  const handleInspectCase = (npz: LoadedNpzCase) => {
    setLoadedNpz(npz);
    setActiveTab('simulator');
  };

  return (
    <div className="min-h-screen bg-[#080B11] text-slate-100 flex flex-col">
      {/* Strictly 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-[#1C2536] bg-[#080B11]/95 backdrop-blur-sm">
        <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single wordmark */}
          <a
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('overview');
            }}
            className="text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0 font-display"
          >
            REDMind
          </a>

          {/* Zone 2: 5 single-line navigation links */}
          <nav className="flex items-center gap-6 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 text-sm font-medium transition-colors border-b-2 whitespace-nowrap shrink-0 ${
                    active
                      ? 'text-cyan-300 border-cyan-400'
                      : 'text-slate-400 border-transparent hover:text-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary CTA */}
          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className={`px-4 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'simulator'
                ? 'bg-cyan-300 text-slate-950 ring-1 ring-cyan-200'
                : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
            }`}
          >
            2D Simulator
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {loadError && (
          <div className="mb-4 border border-rose-500/40 bg-rose-950/30 text-rose-200 px-4 py-3 rounded text-xs">
            ✖ Error loading platform metadata: {loadError}
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewView overview={overview} onNavigate={handleNavigate} />
        )}

        {activeTab === 'simulator' && (
          <SimulatorView
            brineProfiles={overview?.brineProfiles ?? {}}
            molecularWeights={overview?.molecularWeights ?? {}}
            loadedNpz={loadedNpz}
            onClearLoadedNpz={() => setLoadedNpz(null)}
          />
        )}

        {activeTab === 'equations' && <SpecificationsView />}

        {activeTab === 'datasets' && (
          <DatasetsView
            initialCategory={datasetCategory}
            onInspectCase={handleInspectCase}
          />
        )}

        {activeTab === 'all_datasets' && (
          <AllDatasetsView
            onOpenFolder={(cat) =>
              handleNavigate('datasets', { datasetCategory: cat })
            }
          />
        )}

        {activeTab === 'verification' && (
          <VerificationView
            verificationSummary={overview?.verificationSummary ?? []}
            validationSummary={overview?.validationSummary ?? null}
            baselineComparison={overview?.baselineComparison ?? null}
            autoRunCommandId={autoRunVerification}
            onClearAutoRun={() => setAutoRunVerification(null)}
          />
        )}

        {activeTab === 'library' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1C2536] pb-4">
              <div>
                <h1 className="text-xl font-semibold text-slate-100">
                  {librarySubTab === 'figures'
                    ? 'Publication & Diagnostic Figures (18 Charts)'
                    : librarySubTab === 'references'
                      ? 'Literature References & Extracted Model Foundations (16 Sources)'
                      : librarySubTab === 'pinn'
                        ? 'PINN Resources & Google Colab Training Template'
                        : 'Technical Reports, Provenance & Source Code Archive'}
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  {librarySubTab === 'figures'
                    ? 'All generated charts from results/figures/ spanning geometry, Poiseuille flow, 8-ion Nernst–Planck brines, Pitzer SI maps, CNT barriers, and mesh convergence.'
                    : librarySubTab === 'references'
                      ? 'Every published paper, database, brine audit, and exclusion criterion behind REDMind v2.1.0 with exact extracted parameters and code paths.'
                      : librarySubTab === 'pinn'
                        ? 'Google Colab PyTorch blueprint, non-dimensionalized Nernst–Planck & electroneutrality loss functions, case-level NPZ loaders, and exportable .ipynb notebook.'
                        : 'Rendered technical reports (with KaTeX equations), YAML/USGS pitzer.dat configs, Python modules, pytest suites, CLI scripts, and 42-parameter provenance.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0E131D] border border-[#1C2536] rounded shrink-0">
                <button
                  type="button"
                  onClick={() => setLibrarySubTab('figures')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    librarySubTab === 'figures'
                      ? 'bg-[#131A27] text-cyan-300 border border-[#2C3A52]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Figures Gallery (18)
                </button>
                <button
                  type="button"
                  onClick={() => setLibrarySubTab('references')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    librarySubTab === 'references'
                      ? 'bg-[#131A27] text-cyan-300 border border-[#2C3A52]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Literature References (16)
                </button>
                <button
                  type="button"
                  onClick={() => setLibrarySubTab('materials')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    librarySubTab === 'materials'
                      ? 'bg-[#131A27] text-cyan-300 border border-[#2C3A52]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Reports, Configs &amp; Source
                </button>
                <button
                  type="button"
                  onClick={() => setLibrarySubTab('pinn')}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    librarySubTab === 'pinn'
                      ? 'bg-[#131A27] text-cyan-300 border border-[#2C3A52]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  PINN Resources
                </button>
              </div>
            </div>

            {librarySubTab === 'figures' ? (
              <FiguresView />
            ) : librarySubTab === 'references' ? (
              <ReferencesView
                onOpenReport={() => setLibrarySubTab('materials')}
              />
            ) : librarySubTab === 'pinn' ? (
              <PinnResourcesView />
            ) : (
              <MaterialsView />
            )}
          </div>
        )}

      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[#1C2536] py-3 px-6 text-xs text-slate-500">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>
            REDMind v2.1.0 · © 2026 Mohamed Mohamed Sadat &amp; Seif Eldin Montaser · All Rights Reserved
          </span>
          <span className="font-mono tabular-nums">
            {overview
              ? `${overview.manifest.case_counts.repaired_baseline_51} repaired baseline · ${overview.manifest.case_counts.total_new_cases} new cases · ${overview.manifest.case_counts.original_51_preserved} v1.0.0 archive`
              : 'Loading dataset manifest...'}
          </span>
        </div>
      </footer>
    </div>
  );
};

export default App;
