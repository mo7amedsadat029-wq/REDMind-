import React, { useEffect, useMemo, useRef, useState } from 'react';

interface FieldCanvasProps {
  xCoords: number[];
  channelHeightM: number;
  concField: number[][] | null;
  dilField: number[][] | null;
  fieldLabel: string;
  fieldUnit: string;
  colormap?: 'viridis' | 'plasma' | 'diverging';
  animateParticles?: boolean;
  siProfile?: number[] | null;
  uConc?: number[][] | null;
  uDil?: number[][] | null;
  jCem?: number[] | null;
  alphaCemProfile?: number[] | null;
  bcMode?: 'v2_repaired' | 'v1_buggy_cem';
  selectedXIndex?: number | null;
  onSelectXIndex?: (ix: number) => void;
}

function sampleColor(
  tRaw: number,
  cmap: 'viridis' | 'plasma' | 'diverging'
): [number, number, number] {
  const t = Math.max(0, Math.min(1, tRaw));
  if (cmap === 'diverging') {
    const stops: Array<[number, number, number]> = [
      [14, 116, 144],
      [30, 41, 59],
      [245, 158, 11],
    ];
    if (t < 0.5) {
      const k = t * 2;
      return [
        Math.round(stops[0][0] + k * (stops[1][0] - stops[0][0])),
        Math.round(stops[0][1] + k * (stops[1][1] - stops[0][1])),
        Math.round(stops[0][2] + k * (stops[1][2] - stops[0][2])),
      ];
    }
    const k = (t - 0.5) * 2;
    return [
      Math.round(stops[1][0] + k * (stops[2][0] - stops[1][0])),
      Math.round(stops[1][1] + k * (stops[2][1] - stops[1][1])),
      Math.round(stops[1][2] + k * (stops[2][2] - stops[1][2])),
    ];
  }
  if (cmap === 'plasma') {
    const stops: Array<[number, number, number]> = [
      [13, 8, 135],
      [126, 3, 168],
      [204, 71, 120],
      [248, 149, 64],
      [240, 249, 33],
    ];
    const scaled = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    const f = scaled - i;
    return [
      Math.round(stops[i][0] + f * (stops[i + 1][0] - stops[i][0])),
      Math.round(stops[i][1] + f * (stops[i + 1][1] - stops[i][1])),
      Math.round(stops[i][2] + f * (stops[i + 1][2] - stops[i][2])),
    ];
  }
  const stops: Array<[number, number, number]> = [
    [12, 19, 34],
    [14, 116, 144],
    [6, 182, 212],
    [16, 185, 129],
    [250, 204, 21],
  ];
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  return [
    Math.round(stops[i][0] + f * (stops[i + 1][0] - stops[i][0])),
    Math.round(stops[i][1] + f * (stops[i + 1][1] - stops[i][1])),
    Math.round(stops[i][2] + f * (stops[i + 1][2] - stops[i][2])),
  ];
}

function getBounds(grid: number[][] | null): [number, number] {
  if (!grid || grid.length === 0) return [0, 1];
  let mn = Infinity;
  let mx = -Infinity;
  for (const row of grid) {
    for (const v of row) {
      if (Number.isFinite(v)) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
  }
  if (!Number.isFinite(mn)) return [0, 1];
  if (Math.abs(mx - mn) < 1e-12) return [mn - 1e-6, mx + 1e-6];
  return [mn, mx];
}

export const FieldCanvas: React.FC<FieldCanvasProps> = ({
  xCoords,
  channelHeightM,
  concField,
  dilField,
  fieldLabel,
  fieldUnit,
  colormap = 'viridis',
  animateParticles = true,
  siProfile = null,
  uConc = null,
  uDil = null,
  jCem = null,
  alphaCemProfile = null,
  bcMode = 'v2_repaired',
  selectedXIndex = null,
  onSelectXIndex,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    ix: number;
    xCm: number;
    yUm: number;
    channel: 'Concentrated' | 'Dilute';
    val: number;
    uVal?: number;
    jVal?: number;
    si?: number;
  } | null>(null);

  const bounds = useMemo(() => {
    const [minC, maxC] = getBounds(concField);
    const [minD, maxD] = getBounds(dilField);
    const uMaxC = getBounds(uConc)[1];
    const uMaxD = getBounds(uDil)[1];
    const jMax =
      jCem && jCem.length > 0
        ? Math.max(...jCem.map((v) => Math.abs(v)), 1e-12)
        : 1e-4;
    return {
      minAll: Math.min(minC, minD),
      maxAll: Math.max(maxC, maxD),
      minC,
      maxC,
      minD,
      maxD,
      uMax: Math.max(uMaxC, uMaxD, 1e-6),
      jMax,
    };
  }, [concField, dilField, uConc, uDil, jCem]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !concField || !dilField) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const padL = 58;
    const padR = 16;
    const padT = 26;
    const padB = 34;
    const plotW = W - padL - padR;
    const memH = 18;
    const chH = (H - padT - padB - memH) / 2;

    const nx = concField.length;
    const nyC = concField[0]?.length ?? 1;
    const nyD = dilField[0]?.length ?? 1;

    // Tracer ensemble driven directly by real solved velocity u[i][j], CEM flux J_cem[i], and Donnan alpha[i]
    const particles = Array.from({ length: 56 }, (_, k) => ({
      xFrac: (k * 0.6180339) % 1,
      yFrac: ((k * 0.381966) % 0.86) + 0.07,
      isConc: k % 2 === 0,
      isCation: k % 5 !== 0 && k % 5 !== 3, // ~60% cations, ~40% anions
      vyBias: ((k * 0.271828) % 1 - 0.5) * 0.14,
      crossing: false,
      crossProgress: 0,
    }));

    let rafId = 0;
    let lastTime = performance.now();

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      ctx.fillStyle = '#080B11';
      ctx.fillRect(0, 0, W, H);

      const drawGrid = (
        grid: number[][],
        yTop: number,
        heightPx: number,
        vMin: number,
        vMax: number
      ) => {
        const ny = grid[0]?.length ?? 1;
        const cellW = plotW / nx;
        const cellH = heightPx / ny;
        for (let i = 0; i < nx; i++) {
          for (let j = 0; j < ny; j++) {
            const val = grid[i][j];
            const t = (val - vMin) / Math.max(vMax - vMin, 1e-12);
            const [r, g, b] = sampleColor(t, colormap);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            const py = yTop + (ny - 1 - j) * cellH;
            ctx.fillRect(
              padL + i * cellW,
              py,
              Math.ceil(cellW + 0.5),
              Math.ceil(cellH + 0.5)
            );
          }
        }
      };

      const concTop = padT;
      const memTop = concTop + chH;
      const dilTop = memTop + memH;

      drawGrid(concField, concTop, chH, bounds.minAll, bounds.maxAll);
      drawGrid(dilField, dilTop, chH, bounds.minAll, bounds.maxAll);

      // CEM Strip with fixed -SO3- charge markers and real SI > 0 supersaturation band
      ctx.fillStyle = '#0E131D';
      ctx.fillRect(padL, memTop, plotW, memH);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(padL, memTop, plotW, memH);

      if (siProfile && siProfile.length > 0) {
        const segW = plotW / siProfile.length;
        for (let i = 0; i < siProfile.length; i++) {
          const si = siProfile[i];
          if (si > 0) {
            const alpha = Math.min(0.9, 0.25 + si * 0.42);
            ctx.fillStyle = `rgba(245, 158, 11, ${alpha})`;
            ctx.fillRect(padL + i * segW, memTop + 1, Math.ceil(segW), 4);
          }
        }
      }

      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `CEM INTERFACE (-SO₃⁻ Donnan Barrier)  ·  ${bcMode === 'v1_buggy_cem' ? 'v1.0 (+J artifact)' : 'v2.0 (-J permeation)'}`,
        padL + plotW / 2,
        memTop + memH / 2 + 1
      );

      // Real-data driven ion tracers
      if (animateParticles) {
        for (const p of particles) {
          const ix = Math.max(0, Math.min(nx - 1, Math.floor(p.xFrac * nx)));
          const nyActive = p.isConc ? nyC : nyD;
          const jy = Math.max(
            0,
            Math.min(nyActive - 1, Math.floor(p.yFrac * nyActive))
          );

          // Actual solved fluid velocity u(x, y) if provided
          let uNorm = 4 * p.yFrac * (1 - p.yFrac);
          if (p.isConc && uConc && uConc[ix] && uConc[ix][jy] !== undefined) {
            uNorm = uConc[ix][jy] / bounds.uMax;
          } else if (!p.isConc && uDil && uDil[ix] && uDil[ix][jy] !== undefined) {
            uNorm = uDil[ix][jy] / bounds.uMax;
          }

          if (p.crossing) {
            p.crossProgress += dt * 1.4;
            if (p.crossProgress >= 1) {
              p.crossing = false;
              p.isConc = false;
              p.yFrac = 0.92;
            }
            const px = padL + p.xFrac * plotW;
            const py = memTop + p.crossProgress * memH;
            ctx.beginPath();
            ctx.arc(px, py, 2.9, 0, Math.PI * 2);
            ctx.fillStyle = p.isCation
              ? 'rgba(34, 211, 238, 0.95)'
              : 'rgba(245, 158, 11, 0.75)';
            ctx.fill();
            continue;
          }

          p.xFrac += dt * (0.04 + 0.18 * uNorm);
          if (p.xFrac >= 1) {
            p.xFrac = 0;
            // Respawn ions predominantly into concentrated inlet or dilute stream
            p.isConc = Math.random() < 0.55;
            p.yFrac = 0.1 + Math.random() * 0.8;
          }

          // Subtle transverse drift toward CEM when J_cem[ix] is strong
          const jNorm = jCem ? jCem[ix] / bounds.jMax : 0.4;
          const alphaCem = alphaCemProfile ? alphaCemProfile[ix] ?? 0.95 : 0.95;

          if (p.isConc) {
            // Downward migration tendency for cations toward yFrac -> 0 (CEM wall)
            const driftY = p.isCation ? -0.18 * Math.max(jNorm, 0) : p.vyBias;
            p.yFrac += dt * driftY;
            if (p.yFrac <= 0.04) {
              if (p.isCation && jNorm > 0.02 && Math.random() < 0.7 * alphaCem) {
                // Counter-ion permselectively crosses CEM HC -> LC
                p.crossing = true;
                p.crossProgress = 0;
              } else if (!p.isCation && Math.random() > alphaCem) {
                // Rare Donnan co-ion leakage
                p.crossing = true;
                p.crossProgress = 0;
              } else {
                // Co-ion reflected by CEM Donnan exclusion (-SO3- repulsion)
                p.yFrac = 0.05;
                p.vyBias = Math.abs(p.vyBias) + 0.05;
              }
            } else if (p.yFrac >= 0.96) {
              p.yFrac = 0.95;
              p.vyBias = -Math.abs(p.vyBias);
            }
          } else {
            p.yFrac += dt * p.vyBias;
            if (p.yFrac <= 0.05 || p.yFrac >= 0.95) {
              p.vyBias = -p.vyBias;
              p.yFrac = Math.max(0.05, Math.min(0.95, p.yFrac));
            }
          }

          const px = padL + p.xFrac * plotW;
          const py = p.isConc
            ? concTop + (1 - p.yFrac) * chH
            : dilTop + (1 - p.yFrac) * chH;

          ctx.beginPath();
          ctx.arc(px, py, p.isCation ? 2.6 : 2.2, 0, Math.PI * 2);
          ctx.fillStyle = p.isCation
            ? 'rgba(34, 211, 238, 0.9)'
            : 'rgba(245, 158, 11, 0.85)';
          ctx.fill();
        }
      }

      // Pinned vertical axial slice cursor
      const activeIx = hoverInfo?.ix ?? selectedXIndex;
      if (activeIx !== null && activeIx !== undefined && activeIx >= 0 && activeIx < nx) {
        const cx = padL + ((activeIx + 0.5) / nx) * plotW;
        ctx.save();
        ctx.strokeStyle = 'rgba(248, 250, 252, 0.55)';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, concTop);
        ctx.lineTo(cx, dilTop + chH);
        ctx.stroke();
        ctx.restore();
      }

      // Borders & Labels
      ctx.strokeStyle = '#1C2536';
      ctx.lineWidth = 1;
      ctx.strokeRect(padL, concTop, plotW, chH);
      ctx.strokeRect(padL, dilTop, plotW, chH);

      ctx.fillStyle = '#E2E8F0';
      ctx.font = '600 11px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        `Concentrated Channel  [${bounds.minC.toFixed(2)} – ${bounds.maxC.toFixed(2)} ${fieldUnit}]`,
        padL,
        14
      );

      ctx.fillStyle = '#94A3B8';
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(
        `Dilute [${bounds.minD.toFixed(2)} – ${bounds.maxD.toFixed(2)} ${fieldUnit}]`,
        padL + plotW,
        14
      );

      // Y-axis ticks
      ctx.fillStyle = '#64748B';
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      const hUm = (channelHeightM * 1e6).toFixed(0);
      ctx.fillText(`${(2 * Number(hUm)).toFixed(0)} μm`, padL - 6, concTop + 8);
      ctx.fillText(`${hUm} μm`, padL - 6, memTop + memH / 2 + 1);
      ctx.fillText(`0 μm`, padL - 6, dilTop + chH - 4);

      // X-axis ticks
      const maxXCm = (xCoords[xCoords.length - 1] ?? 0.1) * 100;
      ctx.fillStyle = '#64748B';
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      for (let t = 0; t <= 5; t++) {
        const frac = t / 5;
        const tx = padL + frac * plotW;
        ctx.fillText(`${(frac * maxXCm).toFixed(1)} cm`, tx, H - 14);
      }

      if (animateParticles) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [
    concField,
    dilField,
    bounds,
    colormap,
    animateParticles,
    channelHeightM,
    xCoords,
    fieldUnit,
    siProfile,
    uConc,
    uDil,
    jCem,
    alphaCemProfile,
    bcMode,
    hoverInfo?.ix,
    selectedXIndex,
  ]);

  const computePointerData = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !concField || !dilField) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    const padL = 58;
    const padR = 16;
    const padT = 26;
    const padB = 34;
    const memH = 18;
    const plotW = canvas.width - padL - padR;
    const chH = (canvas.height - padT - padB - memH) / 2;

    if (mx < padL || mx > padL + plotW) return null;

    const nx = concField.length;
    const xFrac = Math.max(0, Math.min(0.9999, (mx - padL) / plotW));
    const ix = Math.floor(xFrac * nx);
    const xCm = (xCoords[ix] ?? xFrac * 0.1) * 100;

    const concTop = padT;
    const memTop = concTop + chH;
    const dilTop = memTop + memH;

    if (my >= concTop && my <= concTop + chH) {
      const ny = concField[0]?.length ?? 1;
      const yFrac = 1 - (my - concTop) / chH;
      const jy = Math.max(0, Math.min(ny - 1, Math.floor(yFrac * ny)));
      return {
        ix,
        xCm,
        yUm: channelHeightM * 1e6 * (1 + yFrac),
        channel: 'Concentrated' as const,
        val: concField[ix][jy],
        uVal: uConc?.[ix]?.[jy],
        jVal: jCem?.[ix],
        si: siProfile ? siProfile[ix] : undefined,
      };
    }
    if (my >= dilTop && my <= dilTop + chH) {
      const ny = dilField[0]?.length ?? 1;
      const yFrac = 1 - (my - dilTop) / chH;
      const jy = Math.max(0, Math.min(ny - 1, Math.floor(yFrac * ny)));
      return {
        ix,
        xCm,
        yUm: channelHeightM * 1e6 * yFrac,
        channel: 'Dilute' as const,
        val: dilField[ix][jy],
        uVal: uDil?.[ix]?.[jy],
        jVal: jCem?.[ix],
        si: siProfile ? siProfile[ix] : undefined,
      };
    }
    return null;
  };

  return (
    <div className="relative flex flex-col gap-2">
      <div className="relative border border-[#1C2536] bg-[#080B11] rounded overflow-hidden">
        <canvas
          ref={canvasRef}
          width={920}
          height={368}
          onMouseMove={(e) => setHoverInfo(computePointerData(e))}
          onClick={(e) => {
            const p = computePointerData(e);
            if (p && onSelectXIndex) onSelectXIndex(p.ix);
          }}
          onMouseLeave={() => setHoverInfo(null)}
          className="w-full h-auto block cursor-crosshair"
        />
        {hoverInfo && (
          <div className="pointer-events-none absolute top-8 right-4 bg-[#080B11]/95 border border-[#2C3A52] rounded px-3 py-2 text-xs font-mono tabular-nums text-slate-200">
            <div className="text-cyan-400 font-semibold mb-0.5">
              {hoverInfo.channel} Channel Probe (click to pin x-slice)
            </div>
            <div>
              x = {hoverInfo.xCm.toFixed(2)} cm · y = {hoverInfo.yUm.toFixed(1)} μm
            </div>
            <div>
              {fieldLabel}: {hoverInfo.val.toFixed(4)} {fieldUnit}
            </div>
            {hoverInfo.uVal !== undefined && (
              <div className="text-slate-400">
                u(x,y): {(hoverInfo.uVal * 100).toFixed(3)} cm/s
              </div>
            )}
            {hoverInfo.jVal !== undefined && (
              <div className="text-emerald-400">
                J_CEM(x): {(hoverInfo.jVal * 1e3).toFixed(4)} mmol/(m²·s)
              </div>
            )}
            {hoverInfo.si !== undefined && (
              <div className="text-amber-400">
                CEM Wall SI (Calcite): {hoverInfo.si >= 0 ? '+' : ''}
                {hoverInfo.si.toFixed(3)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Colorbar & Ion Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-1 text-xs font-mono tabular-nums text-slate-400">
        <span>
          {fieldLabel} ({fieldUnit})
        </span>
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
          <span>{bounds.minAll.toFixed(2)}</span>
          <div
            className="h-2 flex-1 rounded-sm border border-[#1C2536]"
            style={{
              background:
                colormap === 'plasma'
                  ? 'linear-gradient(90deg, #0d0887, #7e03a8, #cc4778, #f89540, #f0f921)'
                  : colormap === 'diverging'
                    ? 'linear-gradient(90deg, #0e7490, #1e293b, #f59e0b)'
                    : 'linear-gradient(90deg, #0c1322, #0e7490, #06b6d4, #10b981, #facc15)',
            }}
          />
          <span>{bounds.maxAll.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
            Counter-ions (cross CEM)
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            Co-ions (Donnan-excluded)
          </span>
        </div>
      </div>
    </div>
  );
};
