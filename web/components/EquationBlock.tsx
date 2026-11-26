import React from 'react';
import katex from 'katex';

interface VariableSpec {
  symbol: string;
  meaning: string;
  units: string;
}

interface EquationBlockProps {
  eqNumber: string;
  title: string;
  latex: string;
  codeSymbol: string;
  description?: string;
  variables?: VariableSpec[];
  highlight?: 'cyan' | 'amber' | 'default';
}

export const EquationBlock: React.FC<EquationBlockProps> = ({
  eqNumber,
  title,
  latex,
  codeSymbol,
  description,
  variables,
  highlight = 'default',
}) => {
  const html = katex.renderToString(latex, {
    displayMode: true,
    throwOnError: false,
    strict: false,
  });

  const inlineSymbol = (sym: string) =>
    katex.renderToString(sym, {
      displayMode: false,
      throwOnError: false,
      strict: false,
    });

  return (
    <div
      className={`border rounded bg-[#0E131D] overflow-hidden ${
        highlight === 'amber'
          ? 'border-amber-500/40'
          : highlight === 'cyan'
            ? 'border-cyan-500/35'
            : 'border-[#1C2536]'
      }`}
    >
      <div className="px-4 py-2.5 bg-[#131A27] border-b border-[#1C2536] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`font-mono text-xs font-semibold tabular-nums ${
              highlight === 'amber'
                ? 'text-amber-400'
                : highlight === 'cyan'
                  ? 'text-cyan-400'
                  : 'text-slate-300'
            }`}
          >
            {eqNumber}
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <h4 className="text-sm font-semibold text-slate-100">{title}</h4>
        </div>
        <span className="text-[11px] font-mono text-slate-400 truncate">
          {codeSymbol}
        </span>
      </div>

      <div className="px-5 py-4 bg-[#080B11] overflow-x-auto">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      {(description || (variables && variables.length > 0)) && (
        <div className="px-4 py-3 border-t border-[#1C2536] space-y-2.5">
          {description && (
            <p className="text-xs text-slate-300 leading-relaxed max-w-[78ch]">
              {description}
            </p>
          )}
          {variables && variables.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 pt-1 text-xs">
              {variables.map((v) => (
                <div
                  key={v.symbol}
                  className="flex items-baseline justify-between gap-2 py-0.5 border-b border-[#1C2536]/50"
                >
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span
                      className="text-cyan-300 shrink-0"
                      dangerouslySetInnerHTML={{ __html: inlineSymbol(v.symbol) }}
                    />
                    <span className="text-slate-400 truncate">{v.meaning}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums">
                    {v.units}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
