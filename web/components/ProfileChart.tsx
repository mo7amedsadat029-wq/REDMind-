import React, { useState } from 'react';

export interface ChartSeries {
  label: string;
  color: string;
  dashed?: boolean;
  values: number[];
}

interface ProfileChartProps {
  title: string;
  xLabel: string;
  yLabel: string;
  xValues: number[];
  series: ChartSeries[];
  referenceZeroLine?: boolean;
  height?: number;
}

export const ProfileChart: React.FC<ProfileChartProps> = ({
  title,
  xLabel,
  yLabel,
  xValues,
  series,
  referenceZeroLine = false,
  height = 220,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 760;
  const H = height;
  const padL = 62;
  const padR = 20;
  const padT = 18;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const allVals = series.flatMap((s) => s.values.filter(Number.isFinite));
  let yMin = allVals.length ? Math.min(...allVals) : 0;
  let yMax = allVals.length ? Math.max(...allVals) : 1;
  if (referenceZeroLine) {
    yMin = Math.min(yMin, -0.05);
    yMax = Math.max(yMax, 0.05);
  }
  const ySpan = Math.max(yMax - yMin, 1e-9);
  yMin -= ySpan * 0.08;
  yMax += ySpan * 0.08;

  const xMin = xValues[0] ?? 0;
  const xMax = xValues[xValues.length - 1] ?? 1;
  const xSpan = Math.max(xMax - xMin, 1e-9);

  const toX = (x: number) => padL + ((x - xMin) / xSpan) * plotW;
  const toY = (y: number) =>
    padT + plotH - ((y - yMin) / Math.max(yMax - yMin, 1e-12)) * plotH;

  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (i / 4) * (yMax - yMin));
  const xTicks = Array.from({ length: 5 }, (_, i) => xMin + (i / 4) * (xMax - xMin));

  const formatNum = (v: number) => {
    if (Math.abs(v) >= 100 || Math.abs(v) === 0) return v.toFixed(1);
    if (Math.abs(v) < 0.01) return v.toExponential(1);
    return v.toFixed(3);
  };

  return (
    <div className="border border-slate-800 bg-[#0B0F17] rounded-md p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h4 className="text-xs font-semibold text-slate-200">{title}</h4>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span
                className="inline-block w-4 h-0.5"
                style={{
                  backgroundColor: s.dashed ? 'transparent' : s.color,
                  borderTop: s.dashed ? `2px dashed ${s.color}` : 'none',
                }}
              />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * W;
          const frac = (relX - padL) / plotW;
          if (frac < 0 || frac > 1) {
            setHoverIdx(null);
            return;
          }
          const idx = Math.max(
            0,
            Math.min(xValues.length - 1, Math.round(frac * (xValues.length - 1)))
          );
          setHoverIdx(idx);
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((yt, idx) => (
          <g key={idx}>
            <line
              x1={padL}
              y1={toY(yt)}
              x2={W - padR}
              y2={toY(yt)}
              stroke="#1E293B"
              strokeWidth="1"
            />
            <text
              x={padL - 8}
              y={toY(yt) + 3}
              textAnchor="end"
              fill="#64748B"
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
            >
              {formatNum(yt)}
            </text>
          </g>
        ))}

        {referenceZeroLine && yMin <= 0 && yMax >= 0 && (
          <line
            x1={padL}
            y1={toY(0)}
            x2={W - padR}
            y2={toY(0)}
            stroke="#F59E0B"
            strokeOpacity="0.6"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
        )}

        {xTicks.map((xt, idx) => (
          <text
            key={idx}
            x={toX(xt)}
            y={H - 12}
            textAnchor="middle"
            fill="#64748B"
            fontSize="10"
            fontFamily="JetBrains Mono, monospace"
          >
            {xt.toFixed(1)}
          </text>
        ))}

        <text
          x={padL + plotW / 2}
          y={H - 1}
          textAnchor="middle"
          fill="#94A3B8"
          fontSize="10"
        >
          {xLabel}
        </text>
        <text
          x={12}
          y={padT + plotH / 2}
          textAnchor="middle"
          fill="#94A3B8"
          fontSize="10"
          transform={`rotate(-90 12 ${padT + plotH / 2})`}
        >
          {yLabel}
        </text>

        {series.map((s) => {
          const pts = s.values
            .map((v, i) =>
              Number.isFinite(v) && i < xValues.length
                ? `${toX(xValues[i]).toFixed(1)},${toY(v).toFixed(1)}`
                : null
            )
            .filter(Boolean)
            .join(' ');
          return (
            <polyline
              key={s.label}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeDasharray={s.dashed ? '6 4' : undefined}
              points={pts}
            />
          );
        })}

        {hoverIdx !== null && xValues[hoverIdx] !== undefined && (
          <g>
            <line
              x1={toX(xValues[hoverIdx])}
              y1={padT}
              x2={toX(xValues[hoverIdx])}
              y2={H - padB}
              stroke="#94A3B8"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            {series.map((s) => {
              const v = s.values[hoverIdx];
              if (!Number.isFinite(v)) return null;
              return (
                <circle
                  key={s.label}
                  cx={toX(xValues[hoverIdx])}
                  cy={toY(v)}
                  r="3.5"
                  fill={s.color}
                  stroke="#07090E"
                  strokeWidth="1.5"
                />
              );
            })}
          </g>
        )}
      </svg>

      {hoverIdx !== null && (
        <div className="mt-1 flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-slate-300 border-t border-slate-800/80 pt-1.5">
          <span className="text-slate-400">
            x = {xValues[hoverIdx]?.toFixed(3)}
          </span>
          {series.map((s) => (
            <span key={s.label} style={{ color: s.color }}>
              {s.label}: {formatNum(s.values[hoverIdx] ?? 0)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
