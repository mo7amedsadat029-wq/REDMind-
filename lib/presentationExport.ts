import fs from 'fs';
import path from 'path';
import PptxGenJS from 'pptxgenjs';
import PDFDocument from 'pdfkit';
import { NATIVE_SLIDES_CONTENT } from './presentationContent';

export type PresentationScope = 'full' | 'new_only';

const ROOT = process.cwd();
const SLIDES_CACHE_DIR = path.resolve(ROOT, 'results/presentation_slides');

// REDMind Brand Palette (sampled directly from REDMind_Presentation_.pdf)
const DARK_NAVY = '0B3B59';
const DEEP_INK = '081826';
const TEAL_PILL = '0E7490';
const KICKER_TEAL = '1B6B89';
const SOFT_ICE = 'EFF6FA';
const BORDER_ICE = 'D4E4EE';
const MUTED_SLATE = '475569';
const SLATE_TEXT = '1E293B';

function getPngAspect(filePath: string): number {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length >= 24 && buf.toString('ascii', 12, 16) === 'IHDR') {
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      if (w > 0 && h > 0) return w / h;
    }
  } catch {
    // fallback
  }
  return 16 / 9;
}

function fitRectPreserveAspect(
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  aspect: number
): { x: number; y: number; w: number; h: number } {
  const boxAspect = boxW / Math.max(boxH, 1e-6);
  let w = boxW;
  let h = boxH;
  if (aspect > boxAspect) {
    w = boxW;
    h = boxW / aspect;
  } else {
    h = boxH;
    w = boxH * aspect;
  }
  return {
    x: boxX + (boxW - w) / 2,
    y: boxY + (boxH - h) / 2,
    w,
    h,
  };
}

function getFigPath(filename: string): string {
  return path.resolve(ROOT, 'results/figures', filename);
}

function getOrigSlidePath(origNumber: number): string {
  const name = `orig_p${String(origNumber).padStart(2, '0')}.png`;
  return path.join(SLIDES_CACHE_DIR, name);
}

/* ============================================================================
 * 1. EDITABLE PPTX BUILDER (16:9 WIDESCREEN 13.333" × 7.5")
 * ========================================================================== */
export async function buildPresentationPptxBuffer(
  scope: PresentationScope
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.333" x 7.5"
  pptx.author = 'Seif Eldin Montaser & Mohamed Sadat (NEURANUM / REDMind)';
  pptx.title = 'REDMind — Physics-Informed Neural Network for Desalination Brine RED';
  pptx.subject = 'Updated Presentation with 8-Ion PINN, Pitzer Parity & ML Ablation';

  const W = 13.333;
  const H = 7.5;

  const addPreservedSlide = (origNum: number, patchSlide7Footer = false) => {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };
    const imgPath = getOrigSlidePath(origNum);
    if (fs.existsSync(imgPath)) {
      s.addImage({ path: imgPath, x: 0, y: 0, w: W, h: H });
    }
    if (patchSlide7Footer) {
      s.addShape(pptx.ShapeType.rect, {
        x: 0.25,
        y: 6.76,
        w: 12.83,
        h: 0.56,
        fill: { color: 'FFFFFF' },
        line: { color: 'FFFFFF', width: 0 },
      });
      s.addText(
        'Calcite & Gypsum SI denote thermodynamic supersaturation only (not time-dependent fouling thickness). Real-time 8-ion PINN surrogate trained & validated on NEURANUM v2.1.0 (see Slides 5–7).',
        {
          x: 0.38,
          y: 6.80,
          w: 12.55,
          h: 0.42,
          fontFace: 'Calibri',
          fontSize: 11,
          italic: true,
          color: MUTED_SLATE,
          valign: 'middle',
        }
      );
    }
  };

  const addSlideHeader = (
    s: PptxGenJS.Slide,
    kicker: string,
    title: string,
    bannerText?: string
  ) => {
    s.background = { color: 'FFFFFF' };
    s.addText(kicker.split('').join(' ').replace(/\s{3,}/g, '   '), {
      x: 0.45,
      y: 0.20,
      w: 12.43,
      h: 0.24,
      fontFace: 'Calibri',
      fontSize: 10.5,
      bold: true,
      color: KICKER_TEAL,
    });
    s.addText(title, {
      x: 0.45,
      y: 0.44,
      w: 12.43,
      h: 0.52,
      fontFace: 'Georgia',
      fontSize: 23,
      bold: true,
      color: DEEP_INK,
      valign: 'middle',
    });
    if (bannerText) {
      s.addShape(pptx.ShapeType.roundRect, {
        x: 0.45,
        y: 1.02,
        w: 12.43,
        h: 0.48,
        rectRadius: 0.24,
        fill: { color: DARK_NAVY },
        line: { color: DARK_NAVY, width: 0 },
      });
      s.addText(bannerText, {
        x: 0.68,
        y: 1.04,
        w: 11.98,
        h: 0.44,
        fontFace: 'Calibri',
        fontSize: 12,
        bold: true,
        color: 'FFFFFF',
        valign: 'middle',
      });
    }
  };

  const addPillCard = (
    s: PptxGenJS.Slide,
    x: number,
    y: number,
    w: number,
    h: number,
    pillTitle: string,
    opts?: { darkCard?: boolean; pillColor?: string }
  ) => {
    const dark = opts?.darkCard ?? false;
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      rectRadius: 0.14,
      fill: { color: dark ? DARK_NAVY : SOFT_ICE },
      line: { color: dark ? DARK_NAVY : BORDER_ICE, width: 1 },
    });
    s.addShape(pptx.ShapeType.roundRect, {
      x: x + 0.14,
      y: y + 0.12,
      w: w - 0.28,
      h: 0.36,
      rectRadius: 0.18,
      fill: { color: opts?.pillColor ?? TEAL_PILL },
      line: { color: opts?.pillColor ?? TEAL_PILL, width: 0 },
    });
    s.addText(pillTitle, {
      x: x + 0.28,
      y: y + 0.12,
      w: w - 0.56,
      h: 0.36,
      fontFace: 'Georgia',
      fontSize: 12,
      bold: true,
      color: 'FFFFFF',
      valign: 'middle',
    });
    return { ix: x + 0.16, iy: y + 0.56, iw: w - 0.32, ih: h - 0.68 };
  };

  /* -------------------- NATIVE SLIDE 5 (REPLACES OLD SLIDE 5) -------------------- */
  const buildSlide5 = () => {
    const c = NATIVE_SLIDES_CONTENT.slide5;
    const s = pptx.addSlide();
    addSlideHeader(s, c.kicker, c.title, c.banner);

    // Left column
    const bArch = addPillCard(s, 0.45, 1.64, 5.15, 1.78, c.archCardTitle);
    s.addText(c.archBullets.map((b) => `• ${b}`).join('\n'), {
      x: bArch.ix,
      y: bArch.iy,
      w: bArch.iw,
      h: bArch.ih,
      fontFace: 'Calibri',
      fontSize: 11,
      color: SLATE_TEXT,
      valign: 'top',
    });

    const bTrain = addPillCard(s, 0.45, 3.54, 5.15, 1.66, c.trainCardTitle);
    s.addText(c.trainBullets.map((b) => `• ${b}`).join('\n'), {
      x: bTrain.ix,
      y: bTrain.iy,
      w: bTrain.iw,
      h: bTrain.ih,
      fontFace: 'Calibri',
      fontSize: 11,
      color: SLATE_TEXT,
      valign: 'top',
    });

    // 2x2 KPI Cards
    const kpiW = 2.49;
    const kpiH = 0.88;
    const kpiGapX = 0.17;
    const kpiGapY = 0.14;
    c.kpis.forEach((k, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const kx = 0.45 + col * (kpiW + kpiGapX);
      const ky = 5.32 + row * (kpiH + kpiGapY);
      const isHighlight = idx === 0;
      s.addShape(pptx.ShapeType.roundRect, {
        x: kx,
        y: ky,
        w: kpiW,
        h: kpiH,
        rectRadius: 0.12,
        fill: { color: isHighlight ? DARK_NAVY : 'FFFFFF' },
        line: { color: isHighlight ? DARK_NAVY : BORDER_ICE, width: 1.2 },
      });
      s.addText(k.value, {
        x: kx + 0.12,
        y: ky + 0.08,
        w: kpiW - 0.24,
        h: 0.42,
        fontFace: 'Georgia',
        fontSize: 20,
        bold: true,
        color: isHighlight ? 'FFFFFF' : DARK_NAVY,
        valign: 'middle',
      });
      s.addText(k.label, {
        x: kx + 0.12,
        y: ky + 0.50,
        w: kpiW - 0.24,
        h: 0.30,
        fontFace: 'Calibri',
        fontSize: 10,
        bold: true,
        color: isHighlight ? 'BAE6FD' : MUTED_SLATE,
        valign: 'middle',
      });
    });

    // Right column: Fig 16
    const bFig = addPillCard(s, 5.78, 1.64, 7.10, 5.58, c.figHeader);
    s.addShape(pptx.ShapeType.rect, {
      x: bFig.ix,
      y: bFig.iy,
      w: bFig.iw,
      h: 4.34,
      fill: { color: 'FFFFFF' },
      line: { color: BORDER_ICE, width: 0.8 },
    });
    const figPath = getFigPath(c.figFile);
    if (fs.existsSync(figPath)) {
      const aspect = getPngAspect(figPath);
      const box = fitRectPreserveAspect(
        bFig.ix + 0.08,
        bFig.iy + 0.06,
        bFig.iw - 0.16,
        4.22,
        aspect
      );
      s.addImage({ path: figPath, x: box.x, y: box.y, w: box.w, h: box.h });
    }
    s.addShape(pptx.ShapeType.roundRect, {
      x: bFig.ix,
      y: bFig.iy + 4.44,
      w: bFig.iw,
      h: 0.52,
      rectRadius: 0.10,
      fill: { color: DARK_NAVY },
      line: { color: DARK_NAVY, width: 0 },
    });
    s.addText(c.figFooter, {
      x: bFig.ix + 0.14,
      y: bFig.iy + 4.46,
      w: bFig.iw - 0.28,
      h: 0.48,
      fontFace: 'Calibri',
      fontSize: 10.5,
      bold: true,
      color: 'FFFFFF',
      valign: 'middle',
    });
  };

  /* -------------------- NATIVE SLIDE 6 (NEW) -------------------- */
  const buildSlide6 = () => {
    const c = NATIVE_SLIDES_CONTENT.slide6;
    const s = pptx.addSlide();
    addSlideHeader(s, c.kicker, c.title, c.banner);

    // 4-Stage Pipeline Strip
    const stW = 2.94;
    const stGap = 0.223;
    c.stages.forEach((st, idx) => {
      const sx = 0.45 + idx * (stW + stGap);
      const sy = 1.62;
      s.addShape(pptx.ShapeType.roundRect, {
        x: sx,
        y: sy,
        w: stW,
        h: 1.06,
        rectRadius: 0.12,
        fill: { color: idx === 1 ? DARK_NAVY : SOFT_ICE },
        line: { color: idx === 1 ? DARK_NAVY : BORDER_ICE, width: 1 },
      });
      s.addText(st.num, {
        x: sx + 0.14,
        y: sy + 0.10,
        w: stW - 0.28,
        h: 0.28,
        fontFace: 'Georgia',
        fontSize: 12,
        bold: true,
        color: idx === 1 ? '67E8F9' : TEAL_PILL,
      });
      s.addText(st.desc, {
        x: sx + 0.14,
        y: sy + 0.40,
        w: stW - 0.28,
        h: 0.58,
        fontFace: 'Calibri',
        fontSize: 10.5,
        color: idx === 1 ? 'FFFFFF' : SLATE_TEXT,
        valign: 'top',
      });
    });

    // Left: Fig 17
    const bFig = addPillCard(s, 0.45, 2.84, 7.50, 4.38, c.figHeader);
    s.addShape(pptx.ShapeType.rect, {
      x: bFig.ix,
      y: bFig.iy,
      w: bFig.iw,
      h: 3.16,
      fill: { color: 'FFFFFF' },
      line: { color: BORDER_ICE, width: 0.8 },
    });
    const figPath = getFigPath(c.figFile);
    if (fs.existsSync(figPath)) {
      const aspect = getPngAspect(figPath);
      const box = fitRectPreserveAspect(
        bFig.ix + 0.08,
        bFig.iy + 0.06,
        bFig.iw - 0.16,
        3.04,
        aspect
      );
      s.addImage({ path: figPath, x: box.x, y: box.y, w: box.w, h: box.h });
    }
    s.addShape(pptx.ShapeType.roundRect, {
      x: bFig.ix,
      y: bFig.iy + 3.24,
      w: bFig.iw,
      h: 0.46,
      rectRadius: 0.10,
      fill: { color: DARK_NAVY },
      line: { color: DARK_NAVY, width: 0 },
    });
    s.addText(c.figFooter, {
      x: bFig.ix + 0.12,
      y: bFig.iy + 3.26,
      w: bFig.iw - 0.24,
      h: 0.42,
      fontFace: 'Calibri',
      fontSize: 10.5,
      bold: true,
      color: 'FFFFFF',
      align: 'center',
      valign: 'middle',
    });

    // Right: Dark Navy Scientific Audit Card
    const bProof = addPillCard(s, 8.13, 2.84, 4.75, 4.38, c.proofTitle, {
      darkCard: true,
      pillColor: TEAL_PILL,
    });
    const runs: PptxGenJS.TextProps[] = [];
    c.proofPoints.forEach((p, i) => {
      runs.push({ text: `• ${p.head} `, options: { bold: true, color: '67E8F9' } });
      runs.push({
        text: p.body + (i < c.proofPoints.length - 1 ? '\n\n' : ''),
        options: { color: 'FFFFFF' },
      });
    });
    s.addText(runs, {
      x: bProof.ix,
      y: bProof.iy + 0.04,
      w: bProof.iw,
      h: bProof.ih - 0.06,
      fontFace: 'Calibri',
      fontSize: 10.8,
      valign: 'top',
    });
  };

  /* -------------------- NATIVE SLIDE 7 (NEW) -------------------- */
  const buildSlide7 = () => {
    const c = NATIVE_SLIDES_CONTENT.slide7;
    const s = pptx.addSlide();
    addSlideHeader(s, c.kicker, c.title, c.banner);

    // Top Left: Fig 18
    const bFig = addPillCard(s, 0.45, 1.62, 8.20, 3.12, c.figHeader);
    s.addShape(pptx.ShapeType.rect, {
      x: bFig.ix,
      y: bFig.iy,
      w: bFig.iw,
      h: bFig.ih,
      fill: { color: 'FFFFFF' },
      line: { color: BORDER_ICE, width: 0.8 },
    });
    const figPath = getFigPath(c.figFile);
    if (fs.existsSync(figPath)) {
      const aspect = getPngAspect(figPath);
      const box = fitRectPreserveAspect(
        bFig.ix + 0.08,
        bFig.iy + 0.05,
        bFig.iw - 0.16,
        bFig.ih - 0.10,
        aspect
      );
      s.addImage({ path: figPath, x: box.x, y: box.y, w: box.w, h: box.h });
    }

    // Top Right: 3 Highlight Boxes
    c.highlights.forEach((hl, idx) => {
      const hy = 1.62 + idx * 1.07;
      const isTop = idx === 0;
      s.addShape(pptx.ShapeType.roundRect, {
        x: 8.83,
        y: hy,
        w: 4.05,
        h: 0.96,
        rectRadius: 0.12,
        fill: { color: isTop ? DARK_NAVY : SOFT_ICE },
        line: { color: isTop ? DARK_NAVY : BORDER_ICE, width: 1 },
      });
      s.addText(hl.metric, {
        x: 8.98,
        y: hy + 0.08,
        w: 3.75,
        h: 0.30,
        fontFace: 'Georgia',
        fontSize: 14,
        bold: true,
        color: isTop ? '67E8F9' : TEAL_PILL,
      });
      s.addText(hl.detail, {
        x: 8.98,
        y: hy + 0.39,
        w: 3.75,
        h: 0.48,
        fontFace: 'Calibri',
        fontSize: 10.5,
        color: isTop ? 'FFFFFF' : SLATE_TEXT,
        valign: 'top',
      });
    });

    // Bottom Ablation Table
    const rows: PptxGenJS.TableRow[] = [
      c.tableHeaders.map((h) => ({
        text: h,
        options: {
          bold: true,
          fill: { color: DARK_NAVY },
          color: 'FFFFFF',
          fontSize: 11,
          valign: 'middle' as const,
        },
      })),
      ...c.tableRows.map((r, ri) =>
        r.map((cell, ci) => ({
          text: cell,
          options: {
            fontSize: 10.8,
            bold: ci === 0 || ci === 1 || ci === 4,
            fill: { color: ri % 2 === 0 ? 'FFFFFF' : SOFT_ICE },
            color: ci === 1 ? '047857' : ci === 4 ? TEAL_PILL : SLATE_TEXT,
            valign: 'middle' as const,
          },
        }))
      ),
    ];
    s.addTable(rows, {
      x: 0.45,
      y: 4.88,
      w: 12.43,
      h: 2.34,
      colW: [2.75, 2.05, 2.25, 2.25, 3.13],
      border: { type: 'solid', pt: 0.75, color: BORDER_ICE },
      fontFace: 'Calibri',
    });
  };

  /* -------------------- NATIVE SLIDE 12 (UPDATES OLD SLIDE 10) -------------------- */
  const buildSlide12 = () => {
    const c = NATIVE_SLIDES_CONTENT.slide12;
    const s = pptx.addSlide();
    addSlideHeader(s, c.kicker, c.title);

    // Left Top: Future Plan Card
    const bRoad = addPillCard(s, 0.45, 1.06, 5.95, 4.02, c.roadmapTitle);
    // Vertical connector line
    s.addShape(pptx.ShapeType.line, {
      x: bRoad.ix + 0.18,
      y: bRoad.iy + 0.25,
      w: 0,
      h: 2.75,
      line: { color: BORDER_ICE, width: 1.5 },
    });

    const stepOffsets = [0.02, 1.62, 2.68];
    c.roadmapSteps.forEach((st, idx) => {
      const sy = bRoad.iy + stepOffsets[idx];
      s.addShape(pptx.ShapeType.ellipse, {
        x: bRoad.ix + 0.02,
        y: sy + 0.02,
        w: 0.32,
        h: 0.32,
        fill: { color: TEAL_PILL },
        line: { color: TEAL_PILL, width: 0 },
      });
      s.addText(st.num, {
        x: bRoad.ix + 0.02,
        y: sy + 0.02,
        w: 0.32,
        h: 0.32,
        fontFace: 'Calibri',
        fontSize: 11,
        bold: true,
        color: 'FFFFFF',
        align: 'center',
        valign: 'middle',
      });
      s.addText(st.heading, {
        x: bRoad.ix + 0.46,
        y: sy,
        w: bRoad.iw - 0.50,
        h: 0.26,
        fontFace: 'Calibri',
        fontSize: 12,
        bold: true,
        color: DEEP_INK,
      });
      s.addText(st.bullets.map((b) => `• ${b}`).join('\n'), {
        x: bRoad.ix + 0.46,
        y: sy + 0.26,
        w: bRoad.iw - 0.50,
        h: idx === 0 ? 1.25 : idx === 1 ? 0.96 : 0.46,
        fontFace: 'Calibri',
        fontSize: 10.5,
        color: SLATE_TEXT,
        valign: 'top',
      });
    });

    // Left Bottom: Phase-1 Target
    const bPhase = addPillCard(s, 0.45, 5.22, 5.95, 2.00, c.phase1Title);
    s.addText(
      [
        { text: c.phase1Plant + '\n', options: { bold: true, color: TEAL_PILL, fontSize: 13 } },
        { text: c.phase1Detail + '\n\n', options: { color: SLATE_TEXT, fontSize: 10.5 } },
        { text: c.phase1Alt, options: { color: MUTED_SLATE, fontSize: 10 } },
      ],
      {
        x: bPhase.ix,
        y: bPhase.iy + 0.04,
        w: bPhase.iw,
        h: bPhase.ih - 0.04,
        fontFace: 'Calibri',
        valign: 'top',
      }
    );

    // Right: Dark Navy Conclusion Card
    const bConc = addPillCard(s, 6.60, 1.06, 6.28, 6.16, c.conclusionTitle, {
      darkCard: true,
      pillColor: TEAL_PILL,
    });
    const concRuns: PptxGenJS.TextProps[] = [];
    c.conclusionBullets.forEach((b, idx) => {
      concRuns.push({ text: `• ${b.label} `, options: { bold: true, color: '67E8F9' } });
      concRuns.push({
        text: b.text + (idx < c.conclusionBullets.length - 1 ? '\n\n' : ''),
        options: { color: 'FFFFFF' },
      });
    });
    s.addText(concRuns, {
      x: bConc.ix,
      y: bConc.iy + 0.04,
      w: bConc.iw,
      h: bConc.ih - 0.06,
      fontFace: 'Calibri',
      fontSize: 11,
      valign: 'top',
    });
  };

  if (scope === 'new_only') {
    buildSlide5();
    buildSlide6();
    buildSlide7();
    buildSlide12();
  } else {
    addPreservedSlide(1);
    addPreservedSlide(2);
    addPreservedSlide(3);
    addPreservedSlide(4);
    buildSlide5();
    buildSlide6();
    buildSlide7();
    addPreservedSlide(6);
    addPreservedSlide(7, true);
    addPreservedSlide(8);
    addPreservedSlide(9);
    buildSlide12();
    addPreservedSlide(11);
    addPreservedSlide(12);
  }

  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return Buffer.from(out);
}

/* ============================================================================
 * 2. PRINT / SUBMISSION VECTOR PDF BUILDER (16:9 960×540 pt)
 * ========================================================================== */
export async function buildPresentationPdfBuffer(
  scope: PresentationScope
): Promise<Buffer> {
  const PT = 72;
  const W_IN = 13.333333;
  const H_IN = 7.5;
  const W_PT = W_IN * PT; // 960
  const H_PT = H_IN * PT; // 540

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: [W_PT, H_PT],
      margin: 0,
      autoFirstPage: false,
      info: {
        Title: 'REDMind — Updated 8-Ion PINN Presentation',
        Author: 'Seif Eldin Montaser & Mohamed Sadat (NEURANUM)',
        Subject: 'REDMind Desalination Brine Energy & Scaling Prediction',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const C_NAVY = `#${DARK_NAVY}`;
    const C_INK = `#${DEEP_INK}`;
    const C_TEAL = `#${TEAL_PILL}`;
    const C_KICKER = `#${KICKER_TEAL}`;
    const C_ICE = `#${SOFT_ICE}`;
    const C_BORDER = `#${BORDER_ICE}`;
    const C_MUTED = `#${MUTED_SLATE}`;
    const C_SLATE = `#${SLATE_TEXT}`;

    const addPreservedPdfSlide = (origNum: number, patchSlide7Footer = false) => {
      doc.addPage({ size: [W_PT, H_PT], margin: 0 });
      const imgPath = getOrigSlidePath(origNum);
      if (fs.existsSync(imgPath)) {
        doc.image(imgPath, 0, 0, { width: W_PT, height: H_PT });
      }
      if (patchSlide7Footer) {
        doc.rect(0.25 * PT, 6.76 * PT, 12.83 * PT, 0.56 * PT).fill('#FFFFFF');
        doc
          .font('Helvetica-Oblique')
          .fontSize(10.5)
          .fillColor(C_MUTED)
          .text(
            'Calcite & Gypsum SI denote thermodynamic supersaturation only (not time-dependent fouling thickness). Real-time 8-ion PINN surrogate trained & validated on NEURANUM v2.1.0 (see Slides 5–7).',
            0.38 * PT,
            6.84 * PT,
            { width: 12.55 * PT }
          );
      }
    };

    const drawHeader = (kicker: string, title: string, bannerText?: string) => {
      doc.rect(0, 0, W_PT, H_PT).fill('#FFFFFF');
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(C_KICKER)
        .text(kicker.split('').join(' ').replace(/\s{3,}/g, '   '), 0.45 * PT, 0.22 * PT, {
          width: 12.43 * PT,
        });
      doc
        .font('Times-Bold')
        .fontSize(23)
        .fillColor(C_INK)
        .text(title, 0.45 * PT, 0.46 * PT, { width: 12.43 * PT });
      if (bannerText) {
        doc
          .roundedRect(0.45 * PT, 1.02 * PT, 12.43 * PT, 0.48 * PT, 16)
          .fill(C_NAVY);
        doc
          .font('Helvetica-Bold')
          .fontSize(11.5)
          .fillColor('#FFFFFF')
          .text(bannerText, 0.68 * PT, 1.15 * PT, { width: 11.98 * PT });
      }
    };

    const drawPillCard = (
      xIn: number,
      yIn: number,
      wIn: number,
      hIn: number,
      pillTitle: string,
      darkCard = false
    ) => {
      const x = xIn * PT;
      const y = yIn * PT;
      const w = wIn * PT;
      const h = hIn * PT;
      doc
        .lineWidth(1)
        .roundedRect(x, y, w, h, 10)
        .fillAndStroke(darkCard ? C_NAVY : C_ICE, darkCard ? C_NAVY : C_BORDER);
      doc
        .roundedRect(x + 10, y + 8, w - 20, 26, 12)
        .fill(C_TEAL);
      doc
        .font('Times-Bold')
        .fontSize(12)
        .fillColor('#FFFFFF')
        .text(pillTitle, x + 22, y + 14, { width: w - 44 });
      return { ix: x + 12, iy: y + 42, iw: w - 24, ih: h - 50 };
    };

    /* -------------------- NATIVE SLIDE 5 PDF -------------------- */
    const drawSlide5 = () => {
      const c = NATIVE_SLIDES_CONTENT.slide5;
      doc.addPage({ size: [W_PT, H_PT], margin: 0 });
      drawHeader(c.kicker, c.title, c.banner);

      const bArch = drawPillCard(0.45, 1.64, 5.15, 1.78, c.archCardTitle);
      doc
        .font('Helvetica')
        .fontSize(10.5)
        .fillColor(C_SLATE)
        .text(c.archBullets.map((b) => `• ${b}`).join('\n'), bArch.ix, bArch.iy, {
          width: bArch.iw,
          lineGap: 2.5,
        });

      const bTrain = drawPillCard(0.45, 3.54, 5.15, 1.66, c.trainCardTitle);
      doc
        .font('Helvetica')
        .fontSize(10.5)
        .fillColor(C_SLATE)
        .text(c.trainBullets.map((b) => `• ${b}`).join('\n'), bTrain.ix, bTrain.iy, {
          width: bTrain.iw,
          lineGap: 2.5,
        });

      const kpiW = 2.49;
      const kpiH = 0.88;
      const kpiGapX = 0.17;
      const kpiGapY = 0.14;
      c.kpis.forEach((k, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const kx = (0.45 + col * (kpiW + kpiGapX)) * PT;
        const ky = (5.32 + row * (kpiH + kpiGapY)) * PT;
        const isHl = idx === 0;
        doc
          .lineWidth(1.2)
          .roundedRect(kx, ky, kpiW * PT, kpiH * PT, 8)
          .fillAndStroke(isHl ? C_NAVY : '#FFFFFF', isHl ? C_NAVY : C_BORDER);
        doc
          .font('Times-Bold')
          .fontSize(20)
          .fillColor(isHl ? '#FFFFFF' : C_NAVY)
          .text(k.value, kx + 10, ky + 9, { width: kpiW * PT - 20 });
        doc
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .fillColor(isHl ? '#BAE6FD' : C_MUTED)
          .text(k.label, kx + 10, ky + 38, { width: kpiW * PT - 20 });
      });

      const bFig = drawPillCard(5.78, 1.64, 7.10, 5.58, c.figHeader);
      const figBoxH = 4.34 * PT;
      doc
        .lineWidth(0.8)
        .rect(bFig.ix, bFig.iy, bFig.iw, figBoxH)
        .fillAndStroke('#FFFFFF', C_BORDER);
      const figPath = getFigPath(c.figFile);
      if (fs.existsSync(figPath)) {
        const box = fitRectPreserveAspect(
          bFig.ix + 6,
          bFig.iy + 5,
          bFig.iw - 12,
          figBoxH - 10,
          getPngAspect(figPath)
        );
        doc.image(figPath, box.x, box.y, { width: box.w, height: box.h });
      }
      doc
        .roundedRect(bFig.ix, bFig.iy + figBoxH + 8, bFig.iw, 0.52 * PT, 7)
        .fill(C_NAVY);
      doc
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .fillColor('#FFFFFF')
        .text(c.figFooter, bFig.ix + 10, bFig.iy + figBoxH + 17, {
          width: bFig.iw - 20,
        });
    };

    /* -------------------- NATIVE SLIDE 6 PDF -------------------- */
    const drawSlide6 = () => {
      const c = NATIVE_SLIDES_CONTENT.slide6;
      doc.addPage({ size: [W_PT, H_PT], margin: 0 });
      drawHeader(c.kicker, c.title, c.banner);

      const stW = 2.94;
      const stGap = 0.223;
      c.stages.forEach((st, idx) => {
        const sx = (0.45 + idx * (stW + stGap)) * PT;
        const sy = 1.62 * PT;
        const isHl = idx === 1;
        doc
          .lineWidth(1)
          .roundedRect(sx, sy, stW * PT, 1.06 * PT, 8)
          .fillAndStroke(isHl ? C_NAVY : C_ICE, isHl ? C_NAVY : C_BORDER);
        doc
          .font('Times-Bold')
          .fontSize(12)
          .fillColor(isHl ? '#67E8F9' : C_TEAL)
          .text(st.num, sx + 10, sy + 9, { width: stW * PT - 20 });
        doc
          .font('Helvetica')
          .fontSize(10.2)
          .fillColor(isHl ? '#FFFFFF' : C_SLATE)
          .text(st.desc, sx + 10, sy + 29, { width: stW * PT - 20, lineGap: 2 });
      });

      const bFig = drawPillCard(0.45, 2.84, 7.50, 4.38, c.figHeader);
      const figBoxH = 3.16 * PT;
      doc
        .lineWidth(0.8)
        .rect(bFig.ix, bFig.iy, bFig.iw, figBoxH)
        .fillAndStroke('#FFFFFF', C_BORDER);
      const figPath = getFigPath(c.figFile);
      if (fs.existsSync(figPath)) {
        const box = fitRectPreserveAspect(
          bFig.ix + 6,
          bFig.iy + 5,
          bFig.iw - 12,
          figBoxH - 10,
          getPngAspect(figPath)
        );
        doc.image(figPath, box.x, box.y, { width: box.w, height: box.h });
      }
      doc
        .roundedRect(bFig.ix, bFig.iy + figBoxH + 7, bFig.iw, 0.46 * PT, 7)
        .fill(C_NAVY);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#FFFFFF')
        .text(c.figFooter, bFig.ix + 10, bFig.iy + figBoxH + 17, {
          width: bFig.iw - 20,
          align: 'center',
        });

      const bProof = drawPillCard(8.13, 2.84, 4.75, 4.38, c.proofTitle, true);
      let curY = bProof.iy + 2;
      c.proofPoints.forEach((p) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(10.4)
          .fillColor('#67E8F9')
          .text(`• ${p.head} `, bProof.ix, curY, {
            continued: true,
            width: bProof.iw,
            lineGap: 2,
          })
          .font('Helvetica')
          .fillColor('#FFFFFF')
          .text(p.body);
        curY = doc.y + 8;
      });
    };

    /* -------------------- NATIVE SLIDE 7 PDF -------------------- */
    const drawSlide7 = () => {
      const c = NATIVE_SLIDES_CONTENT.slide7;
      doc.addPage({ size: [W_PT, H_PT], margin: 0 });
      drawHeader(c.kicker, c.title, c.banner);

      const bFig = drawPillCard(0.45, 1.62, 8.20, 3.12, c.figHeader);
      doc
        .lineWidth(0.8)
        .rect(bFig.ix, bFig.iy, bFig.iw, bFig.ih)
        .fillAndStroke('#FFFFFF', C_BORDER);
      const figPath = getFigPath(c.figFile);
      if (fs.existsSync(figPath)) {
        const box = fitRectPreserveAspect(
          bFig.ix + 6,
          bFig.iy + 4,
          bFig.iw - 12,
          bFig.ih - 8,
          getPngAspect(figPath)
        );
        doc.image(figPath, box.x, box.y, { width: box.w, height: box.h });
      }

      c.highlights.forEach((hl, idx) => {
        const hy = (1.62 + idx * 1.07) * PT;
        const isTop = idx === 0;
        doc
          .lineWidth(1)
          .roundedRect(8.83 * PT, hy, 4.05 * PT, 0.96 * PT, 8)
          .fillAndStroke(isTop ? C_NAVY : C_ICE, isTop ? C_NAVY : C_BORDER);
        doc
          .font('Times-Bold')
          .fontSize(13.5)
          .fillColor(isTop ? '#67E8F9' : C_TEAL)
          .text(hl.metric, 8.98 * PT, hy + 8, { width: 3.75 * PT });
        doc
          .font('Helvetica')
          .fontSize(10.2)
          .fillColor(isTop ? '#FFFFFF' : C_SLATE)
          .text(hl.detail, 8.98 * PT, hy + 28, { width: 3.75 * PT, lineGap: 2 });
      });

      // Bottom Comparison Table
      const tx = 0.45 * PT;
      let curY = 4.88 * PT;
      const totalW = 12.43 * PT;
      const colFracs = [2.75 / 12.43, 2.05 / 12.43, 2.25 / 12.43, 2.25 / 12.43, 3.13 / 12.43];
      const drawRow = (cells: string[], isHdr: boolean, rowIdx: number) => {
        const rh = isHdr ? 32 : 34;
        let cx = tx;
        cells.forEach((cell, ci) => {
          const cw = totalW * colFracs[ci];
          const fill = isHdr ? C_NAVY : rowIdx % 2 === 0 ? '#FFFFFF' : C_ICE;
          doc.lineWidth(0.75).rect(cx, curY, cw, rh).fillAndStroke(fill, C_BORDER);
          doc
            .font(isHdr || ci === 0 || ci === 1 || ci === 4 ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(10.3)
            .fillColor(
              isHdr ? '#FFFFFF' : ci === 1 ? '#047857' : ci === 4 ? C_TEAL : C_SLATE
            )
            .text(cell, cx + 8, curY + 10, { width: cw - 16 });
          cx += cw;
        });
        curY += rh;
      };
      drawRow(c.tableHeaders, true, 0);
      c.tableRows.forEach((r, idx) => drawRow(r, false, idx));
    };

    /* -------------------- NATIVE SLIDE 12 PDF -------------------- */
    const drawSlide12 = () => {
      const c = NATIVE_SLIDES_CONTENT.slide12;
      doc.addPage({ size: [W_PT, H_PT], margin: 0 });
      drawHeader(c.kicker, c.title);

      const bRoad = drawPillCard(0.45, 1.06, 5.95, 4.02, c.roadmapTitle);
      doc
        .lineWidth(1.5)
        .strokeColor(C_BORDER)
        .moveTo(bRoad.ix + 13, bRoad.iy + 16)
        .lineTo(bRoad.ix + 13, bRoad.iy + 216)
        .stroke();

      const stepOffsetsPt = [2, 114, 192];
      c.roadmapSteps.forEach((st, idx) => {
        const sy = bRoad.iy + stepOffsetsPt[idx];
        doc.circle(bRoad.ix + 13, sy + 11, 11).fill(C_TEAL);
        doc
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .fillColor('#FFFFFF')
          .text(st.num, bRoad.ix + 2, sy + 6, { width: 22, align: 'center' });
        doc
          .font('Helvetica-Bold')
          .fontSize(11.5)
          .fillColor(C_INK)
          .text(st.heading, bRoad.ix + 33, sy + 2, { width: bRoad.iw - 36 });
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(C_SLATE)
          .text(st.bullets.map((b) => `• ${b}`).join('\n'), bRoad.ix + 33, sy + 18, {
            width: bRoad.iw - 36,
            lineGap: 2,
          });
      });

      const bPhase = drawPillCard(0.45, 5.22, 5.95, 2.00, c.phase1Title);
      doc
        .font('Helvetica-Bold')
        .fontSize(12.5)
        .fillColor(C_TEAL)
        .text(c.phase1Plant, bPhase.ix, bPhase.iy + 2, { width: bPhase.iw });
      doc
        .font('Helvetica')
        .fontSize(10.2)
        .fillColor(C_SLATE)
        .text(c.phase1Detail, bPhase.ix, doc.y + 4, { width: bPhase.iw, lineGap: 2 });
      doc
        .font('Helvetica')
        .fontSize(9.8)
        .fillColor(C_MUTED)
        .text(c.phase1Alt, bPhase.ix, doc.y + 8, { width: bPhase.iw });

      const bConc = drawPillCard(6.60, 1.06, 6.28, 6.16, c.conclusionTitle, true);
      let cy = bConc.iy + 4;
      c.conclusionBullets.forEach((b) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .fillColor('#67E8F9')
          .text(`• ${b.label} `, bConc.ix, cy, {
            continued: true,
            width: bConc.iw,
            lineGap: 2.2,
          })
          .font('Helvetica')
          .fillColor('#FFFFFF')
          .text(b.text);
        cy = doc.y + 9;
      });
    };

    if (scope === 'new_only') {
      drawSlide5();
      drawSlide6();
      drawSlide7();
      drawSlide12();
    } else {
      addPreservedPdfSlide(1);
      addPreservedPdfSlide(2);
      addPreservedPdfSlide(3);
      addPreservedPdfSlide(4);
      drawSlide5();
      drawSlide6();
      drawSlide7();
      addPreservedPdfSlide(6);
      addPreservedPdfSlide(7, true);
      addPreservedPdfSlide(8);
      addPreservedPdfSlide(9);
      drawSlide12();
      addPreservedPdfSlide(11);
      addPreservedPdfSlide(12);
    }

    doc.end();
  });
}
