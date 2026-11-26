import fs from 'fs';
import path from 'path';
import PptxGenJS from 'pptxgenjs';
import PDFDocument from 'pdfkit';
import {
  DEFAULT_POSTER_META,
  POSTER_DATA,
  POSTER_FIGURES,
  PosterCustomMeta,
} from './posterContent';

const ROOT = process.cwd();

function getPngAspect(filePath: string): number {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length >= 24 && buf.toString('ascii', 12, 16) === 'IHDR') {
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      if (w > 0 && h > 0) return w / h;
    }
  } catch {
    // Fallback
  }
  return 1.85;
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

function cleanMeta(meta?: Partial<PosterCustomMeta>): PosterCustomMeta {
  return {
    projectCode: meta?.projectCode?.trim() || DEFAULT_POSTER_META.projectCode,
    teamMembers: meta?.teamMembers?.trim() || DEFAULT_POSTER_META.teamMembers,
    schoolName: meta?.schoolName?.trim() || DEFAULT_POSTER_META.schoolName,
  };
}

/* ============================================================================
 * 1. EDITABLE POWERPOINT (.PPTX) EXPORTER — 48" × 36" STANDARD TRI-FOLD BOARD
 * ========================================================================== */
export async function buildPosterPptxBuffer(
  rawMeta?: Partial<PosterCustomMeta>
): Promise<Buffer> {
  const meta = cleanMeta(rawMeta);
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'ISEF_TRIFOLD_48x36', width: 48, height: 36 });
  pptx.layout = 'ISEF_TRIFOLD_48x36';
  pptx.author = meta.teamMembers;
  pptx.title = POSTER_DATA.title;
  pptx.subject = 'ISEF Display Board — NEURANUM v2.0.0';

  const slide = pptx.addSlide();
  slide.background = { color: 'F1F5F9' };

  const NAVY = '0F2942';
  const TEAL = '0E7490';
  const CYAN = '0369A1';
  const SLATE = '0F172A';
  const MUTED = '334155';
  const BORDER = 'CBD5E1';

  // Panel backgrounds
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.2,
    y: 4.05,
    w: 11.6,
    h: 31.75,
    fill: { color: 'FFFFFF' },
    line: { color: BORDER, width: 1 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 12.2,
    y: 4.05,
    w: 23.6,
    h: 31.75,
    fill: { color: 'FFFFFF' },
    line: { color: BORDER, width: 1 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 36.2,
    y: 4.05,
    w: 11.6,
    h: 31.75,
    fill: { color: 'FFFFFF' },
    line: { color: BORDER, width: 1 },
  });

  // Fold guidelines
  slide.addShape(pptx.ShapeType.line, {
    x: 12.0,
    y: 0.2,
    w: 0,
    h: 35.6,
    line: { color: '94A3B8', width: 1.5, dashType: 'dash' },
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 36.0,
    y: 0.2,
    w: 0,
    h: 35.6,
    line: { color: '94A3B8', width: 1.5, dashType: 'dash' },
  });

  // Top Header Banner (Larger Title & Metadata)
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.2,
    y: 0.2,
    w: 47.6,
    h: 3.65,
    fill: { color: NAVY },
    line: { color: TEAL, width: 2 },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.2,
    y: 3.75,
    w: 47.6,
    h: 0.1,
    fill: { color: '22D3EE' },
    line: { color: '22D3EE', width: 0 },
  });
  slide.addText(POSTER_DATA.title, {
    x: 0.7,
    y: 0.28,
    w: 46.6,
    h: 1.82,
    fontFace: 'Calibri',
    fontSize: 42,
    bold: true,
    color: 'FFFFFF',
    align: 'center',
    valign: 'middle',
  });
  slide.addText(POSTER_DATA.subtitle, {
    x: 1.0,
    y: 2.12,
    w: 46.0,
    h: 0.74,
    fontFace: 'Calibri',
    fontSize: 26,
    color: '67E8F9',
    align: 'center',
    valign: 'middle',
  });
  slide.addText(
    `Project Code: ${meta.projectCode}    |    Team: ${meta.teamMembers}    |    Institution: ${meta.schoolName}`,
    {
      x: 1.0,
      y: 2.92,
      w: 46.0,
      h: 0.68,
      fontFace: 'Calibri',
      fontSize: 22,
      bold: true,
      color: 'E2E8F0',
      align: 'center',
      valign: 'middle',
    }
  );

  const addSectionBox = (
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    accentHex = TEAL,
    bgHex = 'F8FAFC'
  ) => {
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w,
      h,
      fill: { color: bgHex },
      line: { color: BORDER, width: 1.2 },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w,
      h: 0.68,
      fill: { color: accentHex },
      line: { color: accentHex, width: 0 },
    });
    slide.addText(title.toUpperCase(), {
      x: x + 0.18,
      y: y + 0.04,
      w: w - 0.36,
      h: 0.6,
      fontFace: 'Calibri',
      fontSize: 22.5,
      bold: true,
      color: 'FFFFFF',
      valign: 'middle',
    });
    return { ix: x + 0.2, iy: y + 0.8, iw: w - 0.4, ih: h - 0.94 };
  };

  /* -------------------- LEFT COLUMN (11.30" wide) -------------------- */
  const LX = 0.35;
  const LW = 11.3;

  // 1. Abstract
  {
    const b = addSectionBox(LX, 4.2, LW, 5.4, '1. Abstract', NAVY);
    slide.addText(POSTER_DATA.abstract, {
      x: b.ix,
      y: b.iy,
      w: b.iw,
      h: b.ih,
      fontFace: 'Calibri',
      fontSize: 19.5,
      color: SLATE,
      valign: 'top',
    });
  }

  // 2. Purpose & Problem Statement
  {
    const b = addSectionBox(LX, 9.8, LW, 6.35, '2. Purpose & Problem Statement');
    slide.addText(
      [
        { text: 'General Problem: ', options: { bold: true, color: NAVY } },
        { text: POSTER_DATA.generalProblem + '\n\n', options: { color: SLATE } },
        { text: 'Specialized Problem: ', options: { bold: true, color: NAVY } },
        { text: POSTER_DATA.specializedProblem, options: { color: SLATE } },
      ],
      {
        x: b.ix,
        y: b.iy,
        w: b.iw,
        h: 2.75,
        fontFace: 'Calibri',
        fontSize: 18.5,
        valign: 'top',
      }
    );

    const rows: PptxGenJS.TableRow[] = [
      POSTER_DATA.sorourBrineTable.headers.map((h) => ({
        text: h,
        options: { bold: true, fill: { color: 'E2E8F0' }, color: NAVY, fontSize: 17 },
      })),
      ...POSTER_DATA.sorourBrineTable.rows.map((r) =>
        r.map((c) => ({ text: c, options: { fontSize: 17, color: SLATE } }))
      ),
    ];
    slide.addTable(rows, {
      x: b.ix,
      y: b.iy + 2.8,
      w: b.iw,
      h: 2.05,
      border: { type: 'solid', pt: 0.75, color: BORDER },
      fontFace: 'Calibri',
    });
    slide.addText(POSTER_DATA.sorourBrineTable.caption, {
      x: b.ix,
      y: b.iy + 4.95,
      w: b.iw,
      h: 0.42,
      fontFace: 'Calibri',
      fontSize: 15.5,
      italic: true,
      color: MUTED,
    });
  }

  // 3. Background Research & Gap
  {
    const b = addSectionBox(LX, 16.35, LW, 6.3, '3. Background Research & Gap');
    const bgRows: PptxGenJS.TableRow[] = [
      POSTER_DATA.backgroundTable.headers.map((h) => ({
        text: h,
        options: { bold: true, fill: { color: 'E2E8F0' }, color: NAVY, fontSize: 16 },
      })),
      ...POSTER_DATA.backgroundTable.rows.map((r) =>
        r.map((c, idx) => ({
          text: c,
          options: { fontSize: 16, bold: idx === 0, color: idx === 0 ? NAVY : SLATE },
        }))
      ),
    ];
    slide.addTable(bgRows, {
      x: b.ix,
      y: b.iy,
      w: b.iw,
      h: 3.7,
      colW: [2.6, 3.95, 4.35],
      border: { type: 'solid', pt: 0.75, color: BORDER },
      fontFace: 'Calibri',
    });
    slide.addText(
      [
        { text: 'Research Gap: ', options: { bold: true, color: CYAN } },
        { text: POSTER_DATA.researchGap, options: { color: SLATE } },
      ],
      {
        x: b.ix,
        y: b.iy + 3.82,
        w: b.iw,
        h: 1.54,
        fontFace: 'Calibri',
        fontSize: 20.5,
        valign: 'top',
      }
    );
  }

  // 4. Research Question & Hypothesis
  {
    const b = addSectionBox(LX, 22.85, LW, 4.15, '4. Research Question & Hypothesis');
    slide.addText(
      [
        { text: 'Question: ', options: { bold: true, color: NAVY } },
        { text: POSTER_DATA.researchQuestion + '\n\n', options: { color: SLATE } },
        { text: 'Hypothesis: ', options: { bold: true, color: NAVY } },
        { text: POSTER_DATA.hypothesis, options: { color: SLATE } },
      ],
      {
        x: b.ix,
        y: b.iy,
        w: b.iw,
        h: b.ih,
        fontFace: 'Calibri',
        fontSize: 20.5,
        valign: 'top',
      }
    );
  }

  // 5. Materials & Computational Tools
  {
    const b = addSectionBox(LX, 27.2, LW, 3.95, '5. Materials & Software Tools');
    const matRows: PptxGenJS.TableRow[] = [
      ['Tool / Stack', 'Role'].map((h) => ({
        text: h,
        options: { bold: true, fill: { color: 'E2E8F0' }, color: NAVY, fontSize: 16.5 },
      })),
      ...POSTER_DATA.materialsTools.map((r) => [
        { text: r[0], options: { bold: true, fontSize: 16.5, color: NAVY } },
        { text: r[1], options: { fontSize: 16.5, color: SLATE } },
      ]),
    ];
    slide.addTable(matRows, {
      x: b.ix,
      y: b.iy,
      w: b.iw,
      h: b.ih,
      colW: [4.0, 6.9],
      border: { type: 'solid', pt: 0.75, color: BORDER },
      fontFace: 'Calibri',
    });
  }

  // 6. Variables
  {
    const b = addSectionBox(LX, 31.35, LW, 4.25, '6. Variables');
    const varRows: PptxGenJS.TableRow[] = [
      POSTER_DATA.variablesTable.headers.map((h) => ({
        text: h,
        options: { bold: true, fill: { color: 'E2E8F0' }, color: NAVY, fontSize: 16 },
      })),
      ...POSTER_DATA.variablesTable.rows.map((r) => [
        { text: r[0], options: { bold: true, fontSize: 16, color: NAVY } },
        { text: r[1], options: { fontSize: 15.5, color: SLATE } },
      ]),
    ];
    slide.addTable(varRows, {
      x: b.ix,
      y: b.iy,
      w: b.iw,
      h: b.ih,
      colW: [2.75, 8.15],
      border: { type: 'solid', pt: 0.75, color: BORDER },
      fontFace: 'Calibri',
    });
  }

  /* -------------------- CENTER PANEL (23.30" wide) -------------------- */
  const CX = 12.35;
  const CW = 23.3;

  // 7. Procedure
  {
    const b = addSectionBox(CX, 4.2, CW, 4.45, '7. Procedure', NAVY);
    const cols = 4;
    const gap = 0.24;
    const cardW = (b.iw - gap * (cols - 1)) / cols;
    const cardH = 1.65;
    POSTER_DATA.procedureSteps.forEach((stepText, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const sx = b.ix + col * (cardW + gap);
      const sy = b.iy + row * (cardH + 0.16);
      slide.addShape(pptx.ShapeType.rect, {
        x: sx,
        y: sy,
        w: cardW,
        h: cardH,
        fill: { color: 'FFFFFF' },
        line: { color: TEAL, width: 1.2 },
      });
      slide.addText(stepText, {
        x: sx + 0.12,
        y: sy + 0.08,
        w: cardW - 0.24,
        h: cardH - 0.16,
        fontFace: 'Calibri',
        fontSize: 19.5,
        color: SLATE,
        valign: 'top',
      });
    });
  }

  // 8. Data
  {
    const b = addSectionBox(CX, 8.85, CW, 4.45, '8. Data & Benchmark Verification');
    const dataRows: PptxGenJS.TableRow[] = [
      POSTER_DATA.verifiedDataTable.headers.map((h) => ({
        text: h,
        options: { bold: true, fill: { color: 'E2E8F0' }, color: NAVY, fontSize: 18.5 },
      })),
      ...POSTER_DATA.verifiedDataTable.rows.map((r) =>
        r.map((c, ci) => ({
          text: c,
          options: {
            fontSize: 18.5,
            bold: ci === 0 || ci === 3,
            color: ci === 3 ? '047857' : SLATE,
          },
        }))
      ),
    ];
    slide.addTable(dataRows, {
      x: b.ix,
      y: b.iy,
      w: b.iw,
      h: b.ih,
      colW: [7.5, 4.8, 5.8, 4.8],
      border: { type: 'solid', pt: 0.75, color: BORDER },
      fontFace: 'Calibri',
    });
  }

  // 9. Graphs — 3×2 HIGH-RES GRID (SOLVER + 8-ION PINN RESULTS)
  {
    const b = addSectionBox(
      CX,
      13.5,
      CW,
      17.05,
      '9. Graphs — Multi-Physics Transport, Scaling Risk & 8-Ion PINN Parity',
      NAVY
    );
    const cols = 3;
    const rowsCount = 2;
    const gapX = 0.24;
    const gapY = 0.24;
    const cellW = (b.iw - gapX * (cols - 1)) / cols;
    const cellH = (b.ih - gapY * (rowsCount - 1)) / rowsCount;

    POSTER_FIGURES.forEach((fig, idx) => {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const fx = b.ix + c * (cellW + gapX);
      const fy = b.iy + r * (cellH + gapY);

      slide.addShape(pptx.ShapeType.rect, {
        x: fx,
        y: fy,
        w: cellW,
        h: cellH,
        fill: { color: 'FFFFFF' },
        line: { color: BORDER, width: 1.2 },
      });
      slide.addText(fig.title, {
        x: fx + 0.14,
        y: fy + 0.08,
        w: cellW - 0.28,
        h: 0.48,
        fontFace: 'Calibri',
        fontSize: 16.5,
        bold: true,
        color: NAVY,
      });

      const imgPath = path.resolve(ROOT, 'results/figures', fig.filename);
      if (fs.existsSync(imgPath)) {
        const aspect = getPngAspect(imgPath);
        const box = fitRectPreserveAspect(
          fx + 0.14,
          fy + 0.58,
          cellW - 0.28,
          cellH - 1.98,
          aspect
        );
        slide.addImage({
          path: imgPath,
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
        });
      }

      slide.addText(`Axes / Units: ${fig.axesAndUnits}`, {
        x: fx + 0.14,
        y: fy + cellH - 1.32,
        w: cellW - 0.28,
        h: 0.4,
        fontFace: 'Calibri',
        fontSize: 13.5,
        bold: true,
        color: CYAN,
      });
      slide.addText(fig.caption, {
        x: fx + 0.14,
        y: fy + cellH - 0.88,
        w: cellW - 0.28,
        h: 0.8,
        fontFace: 'Calibri',
        fontSize: 13.5,
        color: MUTED,
        valign: 'top',
      });
    });
  }

  // 10. Data Analysis
  {
    const b = addSectionBox(CX, 30.75, CW, 4.85, '10. Data Analysis');
    const colW = (b.iw - 0.28) / 2;
    const rowH = (b.ih - 0.2) / 2;
    POSTER_DATA.dataAnalysisPoints.forEach((pt, idx) => {
      const r = Math.floor(idx / 2);
      const c = idx % 2;
      const px = b.ix + c * (colW + 0.28);
      const py = b.iy + r * (rowH + 0.2);
      slide.addShape(pptx.ShapeType.rect, {
        x: px,
        y: py,
        w: colW,
        h: rowH,
        fill: { color: 'FFFFFF' },
        line: { color: BORDER, width: 1 },
      });
      slide.addText(pt, {
        x: px + 0.14,
        y: py + 0.1,
        w: colW - 0.28,
        h: rowH - 0.2,
        fontFace: 'Calibri',
        fontSize: 22.5,
        color: SLATE,
        valign: 'top',
      });
    });
  }

  /* -------------------- RIGHT COLUMN (11.30" wide) -------------------- */
  const RX = 36.35;
  const RW = 11.3;

  // 11. Results
  {
    const b = addSectionBox(RX, 4.2, RW, 4.7, '11. Results');
    slide.addText(
      POSTER_DATA.resultsSummary.map((s) => `• ${s}`).join('\n\n'),
      {
        x: b.ix,
        y: b.iy,
        w: b.iw,
        h: b.ih,
        fontFace: 'Calibri',
        fontSize: 22,
        color: SLATE,
        valign: 'top',
      }
    );
  }

  // 12. 8-Ion PINN Validation & Scope
  {
    const b = addSectionBox(
      RX,
      9.1,
      RW,
      5.95,
      '12. 8-Ion PINN Validation & Scope',
      NAVY
    );
    const pRows: PptxGenJS.TableRow[] = [
      POSTER_DATA.pinnSummaryTable.headers.map((h) => ({
        text: h,
        options: { bold: true, fill: { color: 'E2E8F0' }, color: NAVY, fontSize: 16 },
      })),
      ...POSTER_DATA.pinnSummaryTable.rows.map((r) => [
        { text: r[0], options: { bold: true, fontSize: 16, color: NAVY } },
        { text: r[1], options: { fontSize: 16, bold: true, color: SLATE } },
        { text: r[2], options: { fontSize: 15.5, color: MUTED } },
      ]),
    ];
    slide.addTable(pRows, {
      x: b.ix,
      y: b.iy,
      w: b.iw,
      h: 3.45,
      colW: [3.65, 2.35, 4.9],
      border: { type: 'solid', pt: 0.75, color: BORDER },
      fontFace: 'Calibri',
    });
    slide.addText(POSTER_DATA.pinnSummaryTable.note, {
      x: b.ix,
      y: b.iy + 3.6,
      w: b.iw,
      h: 1.4,
      fontFace: 'Calibri',
      fontSize: 19,
      italic: true,
      color: MUTED,
      valign: 'top',
    });
  }

  // 13. Conclusions
  {
    const b = addSectionBox(RX, 15.25, RW, 5.4, '13. Conclusions', NAVY);
    slide.addText(
      POSTER_DATA.conclusions.map((c) => `• ${c}`).join('\n\n'),
      {
        x: b.ix,
        y: b.iy,
        w: b.iw,
        h: b.ih,
        fontFace: 'Calibri',
        fontSize: 23.5,
        color: SLATE,
        valign: 'top',
      }
    );
  }

  // 14. Applications & Future Work
  {
    const b = addSectionBox(RX, 20.85, RW, 7.1, '14. Applications & Future Work');
    slide.addText(
      [
        { text: 'Applications:\n', options: { bold: true, color: NAVY } },
        { text: POSTER_DATA.applications.map((a) => `• ${a}`).join('\n') + '\n\n', options: { color: SLATE } },
        { text: 'Future Work:\n', options: { bold: true, color: NAVY } },
        { text: POSTER_DATA.futureWork.join('\n'), options: { color: SLATE } },
      ],
      {
        x: b.ix,
        y: b.iy,
        w: b.iw,
        h: b.ih,
        fontFace: 'Calibri',
        fontSize: 22,
        valign: 'top',
      }
    );
  }

  // 15. Research Sources (APA)
  {
    const b = addSectionBox(RX, 28.15, RW, 7.45, '15. Research Sources (APA)', NAVY);
    slide.addText(POSTER_DATA.apaReferences.join('\n'), {
      x: b.ix,
      y: b.iy,
      w: b.iw,
      h: b.ih,
      fontFace: 'Calibri',
      fontSize: 18,
      color: SLATE,
      valign: 'top',
    });
  }

  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return Buffer.from(out);
}

/* ============================================================================
 * 2. PRINT-READY VECTOR PDF EXPORTER — 48" × 36" BOARD
 * ========================================================================== */
export async function buildPosterPdfBuffer(
  rawMeta?: Partial<PosterCustomMeta>
): Promise<Buffer> {
  const meta = cleanMeta(rawMeta);
  const PT = 72;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: [48 * PT, 36 * PT],
      margin: 0,
      info: {
        Title: POSTER_DATA.title,
        Author: meta.teamMembers,
        Subject: 'NEURANUM v2.0.0 ISEF Display Board',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const NAVY = '#0F2942';
    const TEAL = '#0E7490';
    const CYAN = '#0369A1';
    const SLATE = '#0F172A';
    const MUTED = '#334155';
    const BORDER = '#CBD5E1';

    doc.rect(0, 0, 48 * PT, 36 * PT).fill('#F1F5F9');

    for (const [wx, ww] of [
      [0.2, 11.6],
      [12.2, 23.6],
      [36.2, 11.6],
    ]) {
      doc
        .rect(wx * PT, 4.05 * PT, ww * PT, 31.75 * PT)
        .fillAndStroke('#FFFFFF', BORDER);
    }

    doc
      .save()
      .dash(10, { space: 8 })
      .strokeColor('#94A3B8')
      .lineWidth(1.5)
      .moveTo(12 * PT, 0.2 * PT)
      .lineTo(12 * PT, 35.8 * PT)
      .moveTo(36 * PT, 0.2 * PT)
      .lineTo(36 * PT, 35.8 * PT)
      .stroke()
      .restore();

    // Header Banner
    doc
      .rect(0.2 * PT, 0.2 * PT, 47.6 * PT, 3.65 * PT)
      .fillAndStroke(NAVY, TEAL);
    doc.rect(0.2 * PT, 3.75 * PT, 47.6 * PT, 0.1 * PT).fill('#22D3EE');

    doc
      .font('Helvetica-Bold')
      .fontSize(40)
      .fillColor('#FFFFFF')
      .text(POSTER_DATA.title, 0.7 * PT, 0.34 * PT, {
        width: 46.6 * PT,
        align: 'center',
      });
    doc
      .font('Helvetica')
      .fontSize(25)
      .fillColor('#67E8F9')
      .text(POSTER_DATA.subtitle, 1.0 * PT, 2.18 * PT, {
        width: 46.0 * PT,
        align: 'center',
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(21)
      .fillColor('#E2E8F0')
      .text(
        `Project Code: ${meta.projectCode}    |    Team: ${meta.teamMembers}    |    Institution: ${meta.schoolName}`,
        1.0 * PT,
        3.02 * PT,
        { width: 46.0 * PT, align: 'center' }
      );

    const drawBox = (
      xIn: number,
      yIn: number,
      wIn: number,
      hIn: number,
      title: string,
      headerColor = TEAL,
      bgColor = '#F8FAFC'
    ) => {
      const x = xIn * PT;
      const y = yIn * PT;
      const w = wIn * PT;
      const h = hIn * PT;
      const hdrH = 0.68 * PT;
      doc.lineWidth(1.2).rect(x, y, w, h).fillAndStroke(bgColor, BORDER);
      doc.rect(x, y, w, hdrH).fill(headerColor);
      doc
        .font('Helvetica-Bold')
        .fontSize(21)
        .fillColor('#FFFFFF')
        .text(title.toUpperCase(), x + 14, y + 13, { width: w - 28 });
      return {
        x: x + 14,
        y: y + hdrH + 10,
        w: w - 28,
        h: h - hdrH - 20,
      };
    };

    const drawSimpleTable = (
      tx: number,
      ty: number,
      tw: number,
      headers: string[],
      rows: string[][],
      colFractions: number[],
      fontSize = 14,
      rowH = 30
    ) => {
      let curY = ty;
      const drawRow = (cells: string[], isHdr: boolean) => {
        let curX = tx;
        const h = isHdr ? rowH + 2 : rowH;
        cells.forEach((cell, ci) => {
          const cw = tw * colFractions[ci];
          doc
            .lineWidth(0.75)
            .rect(curX, curY, cw, h)
            .fillAndStroke(isHdr ? '#E2E8F0' : '#FFFFFF', BORDER);
          doc
            .font(isHdr ? 'Helvetica-Bold' : ci === 0 ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(fontSize)
            .fillColor(isHdr ? NAVY : SLATE)
            .text(cell, curX + 8, curY + 7, {
              width: cw - 16,
              height: h - 10,
              ellipsis: true,
            });
          curX += cw;
        });
        curY += h;
      };
      drawRow(headers, true);
      rows.forEach((r) => drawRow(r, false));
      return curY;
    };

    /* -------------------- LEFT COLUMN PDF -------------------- */
    const LX = 0.35;
    const LW = 11.3;

    // 1. Abstract
    {
      const b = drawBox(LX, 4.2, LW, 5.4, '1. Abstract', NAVY);
      doc
        .font('Helvetica')
        .fontSize(18.5)
        .fillColor(SLATE)
        .text(POSTER_DATA.abstract, b.x, b.y, { width: b.w, lineGap: 2.5 });
    }

    // 2. Purpose & Problem
    {
      const b = drawBox(LX, 9.8, LW, 6.35, '2. Purpose & Problem Statement');
      doc
        .font('Helvetica-Bold')
        .fontSize(17.5)
        .fillColor(NAVY)
        .text('General Problem: ', b.x, b.y, { continued: true, width: b.w })
        .font('Helvetica')
        .fillColor(SLATE)
        .text(POSTER_DATA.generalProblem, { lineGap: 2 });

      doc
        .font('Helvetica-Bold')
        .fontSize(17.5)
        .fillColor(NAVY)
        .text('\nSpecialized Problem: ', { continued: true, width: b.w })
        .font('Helvetica')
        .fillColor(SLATE)
        .text(POSTER_DATA.specializedProblem, { lineGap: 2 });

      const tableEndY = drawSimpleTable(
        b.x,
        b.y + 2.68 * PT,
        b.w,
        POSTER_DATA.sorourBrineTable.headers,
        POSTER_DATA.sorourBrineTable.rows,
        [0.4, 0.3, 0.3],
        16,
        37
      );
      doc
        .font('Helvetica-Oblique')
        .fontSize(14.5)
        .fillColor(MUTED)
        .text(POSTER_DATA.sorourBrineTable.caption, b.x, tableEndY + 8, {
          width: b.w,
        });
    }

    // 3. Background & Gap
    {
      const b = drawBox(LX, 16.35, LW, 6.3, '3. Background Research & Gap');
      const tEnd = drawSimpleTable(
        b.x,
        b.y,
        b.w,
        POSTER_DATA.backgroundTable.headers,
        POSTER_DATA.backgroundTable.rows,
        [0.24, 0.36, 0.4],
        15,
        37
      );
      doc
        .font('Helvetica-Bold')
        .fontSize(19.5)
        .fillColor(CYAN)
        .text('Research Gap: ', b.x, tEnd + 12, { continued: true, width: b.w })
        .font('Helvetica')
        .fillColor(SLATE)
        .text(POSTER_DATA.researchGap, { lineGap: 2.5 });
    }

    // 4. RQ & Hypothesis
    {
      const b = drawBox(LX, 22.85, LW, 4.15, '4. Research Question & Hypothesis');
      doc
        .font('Helvetica-Bold')
        .fontSize(19.5)
        .fillColor(NAVY)
        .text('Question: ', b.x, b.y, { continued: true, width: b.w })
        .font('Helvetica')
        .fillColor(SLATE)
        .text(POSTER_DATA.researchQuestion, { lineGap: 3 });
      doc
        .font('Helvetica-Bold')
        .fontSize(19.5)
        .fillColor(NAVY)
        .text('\nHypothesis: ', { continued: true, width: b.w })
        .font('Helvetica')
        .fillColor(SLATE)
        .text(POSTER_DATA.hypothesis, { lineGap: 3 });
    }

    // 5. Materials
    {
      const b = drawBox(LX, 27.2, LW, 3.95, '5. Materials & Software Tools');
      drawSimpleTable(
        b.x,
        b.y,
        b.w,
        ['Tool / Stack', 'Role'],
        POSTER_DATA.materialsTools,
        [0.36, 0.64],
        15.5,
        41
      );
    }

    // 6. Variables
    {
      const b = drawBox(LX, 31.35, LW, 4.25, '6. Variables');
      drawSimpleTable(
        b.x,
        b.y,
        b.w,
        POSTER_DATA.variablesTable.headers,
        POSTER_DATA.variablesTable.rows,
        [0.25, 0.75],
        15,
        64
      );
    }

    /* -------------------- CENTER COLUMN PDF -------------------- */
    const CX = 12.35;
    const CW = 23.3;

    // 7. Procedure
    {
      const b = drawBox(CX, 4.2, CW, 4.45, '7. Procedure', NAVY);
      const cols = 4;
      const gap = 16;
      const cardW = (b.w - gap * (cols - 1)) / cols;
      const cardH = 114;
      POSTER_DATA.procedureSteps.forEach((step, idx) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const sx = b.x + c * (cardW + gap);
        const sy = b.y + r * (cardH + 12);
        doc.lineWidth(1.2).rect(sx, sy, cardW, cardH).fillAndStroke('#FFFFFF', TEAL);
        doc
          .font('Helvetica')
          .fontSize(19)
          .fillColor(SLATE)
          .text(step, sx + 10, sy + 8, { width: cardW - 20, lineGap: 2.5 });
      });
    }

    // 8. Data
    {
      const b = drawBox(CX, 8.85, CW, 4.45, '8. Data & Benchmark Verification');
      drawSimpleTable(
        b.x,
        b.y,
        b.w,
        POSTER_DATA.verifiedDataTable.headers,
        POSTER_DATA.verifiedDataTable.rows,
        [0.32, 0.21, 0.25, 0.22],
        17.5,
        35
      );
    }

    // 9. Graphs — 3×2 HIGH-RES GRID
    {
      const b = drawBox(
        CX,
        13.5,
        CW,
        17.05,
        '9. Graphs — Multi-Physics Transport, Scaling Risk & 8-Ion PINN Parity',
        NAVY
      );
      const cols = 3;
      const rowsCount = 2;
      const gapX = 16;
      const gapY = 16;
      const cellW = (b.w - gapX * (cols - 1)) / cols;
      const cellH = (b.h - gapY * (rowsCount - 1)) / rowsCount;

      POSTER_FIGURES.forEach((fig, idx) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const fx = b.x + c * (cellW + gapX);
        const fy = b.y + r * (cellH + gapY);

        doc.lineWidth(1.2).rect(fx, fy, cellW, cellH).fillAndStroke('#FFFFFF', BORDER);
        doc
          .font('Helvetica-Bold')
          .fontSize(15.5)
          .fillColor(NAVY)
          .text(fig.title, fx + 10, fy + 8, { width: cellW - 20 });

        const imgPath = path.resolve(ROOT, 'results/figures', fig.filename);
        if (fs.existsSync(imgPath)) {
          const aspect = getPngAspect(imgPath);
          const box = fitRectPreserveAspect(
            fx + 10,
            fy + 38,
            cellW - 20,
            cellH - 134,
            aspect
          );
          doc.image(imgPath, box.x, box.y, { width: box.w, height: box.h });
        }

        doc
          .font('Helvetica-Bold')
          .fontSize(13)
          .fillColor(CYAN)
          .text(`Axes / Units: ${fig.axesAndUnits}`, fx + 10, fy + cellH - 88, {
            width: cellW - 20,
          });
        doc
          .font('Helvetica')
          .fontSize(13)
          .fillColor(MUTED)
          .text(fig.caption, fx + 10, fy + cellH - 58, { width: cellW - 20 });
      });
    }

    // 10. Data Analysis
    {
      const b = drawBox(CX, 30.75, CW, 4.85, '10. Data Analysis');
      const colW = (b.w - 20) / 2;
      const rowH = (b.h - 14) / 2;
      POSTER_DATA.dataAnalysisPoints.forEach((pt, idx) => {
        const r = Math.floor(idx / 2);
        const c = idx % 2;
        const px = b.x + c * (colW + 20);
        const py = b.y + r * (rowH + 14);
        doc.lineWidth(1).rect(px, py, colW, rowH).fillAndStroke('#FFFFFF', BORDER);
        doc
          .font('Helvetica')
          .fontSize(22)
          .fillColor(SLATE)
          .text(pt, px + 12, py + 10, { width: colW - 24, lineGap: 2.5 });
      });
    }

    /* -------------------- RIGHT COLUMN PDF -------------------- */
    const RX = 36.35;
    const RW = 11.3;

    // 11. Results
    {
      const b = drawBox(RX, 4.2, RW, 4.7, '11. Results');
      doc
        .font('Helvetica')
        .fontSize(21.5)
        .fillColor(SLATE)
        .text(
          POSTER_DATA.resultsSummary.map((s) => `• ${s}`).join('\n\n'),
          b.x,
          b.y,
          { width: b.w, lineGap: 2.5 }
        );
    }

    // 12. 8-Ion PINN Validation & Scope
    {
      const b = drawBox(
        RX,
        9.1,
        RW,
        5.95,
        '12. 8-Ion PINN Validation & Scope',
        NAVY
      );
      const tEnd = drawSimpleTable(
        b.x,
        b.y,
        b.w,
        POSTER_DATA.pinnSummaryTable.headers,
        POSTER_DATA.pinnSummaryTable.rows,
        [0.34, 0.22, 0.44],
        15.5,
        46
      );
      doc
        .font('Helvetica-Oblique')
        .fontSize(18.5)
        .fillColor(MUTED)
        .text(POSTER_DATA.pinnSummaryTable.note, b.x, tEnd + 10, {
          width: b.w,
          lineGap: 2.5,
        });
    }

    // 13. Conclusions
    {
      const b = drawBox(RX, 15.25, RW, 5.4, '13. Conclusions', NAVY);
      doc
        .font('Helvetica')
        .fontSize(22.5)
        .fillColor(SLATE)
        .text(
          POSTER_DATA.conclusions.map((c) => `• ${c}`).join('\n\n'),
          b.x,
          b.y,
          { width: b.w, lineGap: 2.5 }
        );
    }

    // 14. Applications & Future Work
    {
      const b = drawBox(RX, 20.85, RW, 7.1, '14. Applications & Future Work');
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor(NAVY)
        .text('Applications:', b.x, b.y, { width: b.w });
      doc
        .font('Helvetica')
        .fontSize(21)
        .fillColor(SLATE)
        .text(POSTER_DATA.applications.map((a) => `• ${a}`).join('\n'), {
          width: b.w,
          lineGap: 2.5,
        });
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor(NAVY)
        .text('\nFuture Work:', { width: b.w });
      doc
        .font('Helvetica')
        .fontSize(21)
        .fillColor(SLATE)
        .text(POSTER_DATA.futureWork.join('\n'), {
          width: b.w,
          lineGap: 2.5,
        });
    }

    // 15. Research Sources (APA)
    {
      const b = drawBox(RX, 28.15, RW, 7.45, '15. Research Sources (APA)', NAVY);
      doc
        .font('Helvetica')
        .fontSize(17.5)
        .fillColor(SLATE)
        .text(POSTER_DATA.apaReferences.join('\n'), b.x, b.y, {
          width: b.w,
          lineGap: 2.5,
        });
    }

    doc.end();
  });
}
