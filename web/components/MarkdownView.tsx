import React from 'react';
import katex from 'katex';

interface MarkdownViewProps {
  content: string;
}

function renderTex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return tex;
  }
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content }) => {
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let i = 0;

  const renderInline = (text: string): React.ReactNode[] => {
    // Split on display inline tokens: `code`, **bold**, $math$
    const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\$[^$\n]+\$)/g;
    const parts = text.split(tokenRegex);
    return parts.map((p, idx) => {
      if (!p) return null;
      if (p.startsWith('`') && p.endsWith('`') && p.length >= 2) {
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 rounded bg-[#131A27] border border-[#1C2536] text-cyan-300 font-mono text-[0.86em]"
          >
            {p.slice(1, -1)}
          </code>
        );
      }
      if (p.startsWith('**') && p.endsWith('**') && p.length >= 4) {
        return (
          <strong key={idx} className="font-semibold text-slate-100">
            {p.slice(2, -2)}
          </strong>
        );
      }
      if (p.startsWith('$') && p.endsWith('$') && p.length >= 3) {
        const html = renderTex(p.slice(1, -1), false);
        return (
          <span
            key={idx}
            className="inline-block align-baseline mx-0.5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }
      return <React.Fragment key={idx}>{p}</React.Fragment>;
    });
  };

  while (i < lines.length) {
    const line = lines[i];

    // Block math $$...$$
    if (line.trim().startsWith('$$')) {
      if (line.trim().endsWith('$$') && line.trim().length > 4) {
        const eq = line.trim().slice(2, -2);
        blocks.push(
          <div
            key={`math-${i}`}
            className="my-4 px-4 py-3 rounded border border-[#1C2536] bg-[#080B11] overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: renderTex(eq, true) }}
          />
        );
        i++;
        continue;
      }
      const mathLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('$$')) {
        mathLines.push(lines[i]);
        i++;
      }
      blocks.push(
        <div
          key={`math-${i}`}
          className="my-4 px-4 py-3 rounded border border-[#1C2536] bg-[#080B11] overflow-x-auto"
          dangerouslySetInnerHTML={{
            __html: renderTex(mathLines.join('\n'), true),
          }}
        />
      );
      i++;
      continue;
    }

    // Code block
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push(
        <pre
          key={`code-${i}`}
          className="my-4 p-4 rounded border border-[#1C2536] bg-[#080B11] text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed"
        >
          {codeLines.join('\n')}
        </pre>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={`hr-${i}`} className="my-5 border-[#1C2536]" />);
      i++;
      continue;
    }

    // Table
    if (line.trim().startsWith('|') && lines[i + 1]?.includes('---')) {
      const parseRow = (r: string) =>
        r
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
      const headers = parseRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      blocks.push(
        <div
          key={`tbl-${i}`}
          className="my-4 overflow-x-auto border border-[#1C2536] rounded"
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#131A27] border-b border-[#1C2536] text-slate-300">
              <tr>
                {headers.map((h, hi) => (
                  <th key={hi} className="py-2.5 px-3 font-semibold whitespace-nowrap">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1C2536]/80">
              {rows.map((r, ri) => (
                <tr key={ri} className="hover:bg-[#131A27]/50">
                  {r.map((cell, ci) => (
                    <td
                      key={ci}
                      className="py-2 px-3 text-slate-300 font-mono tabular-nums"
                    >
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      blocks.push(
        <h1
          key={`h1-${i}`}
          className="text-2xl font-bold text-slate-50 mt-6 mb-3 tracking-tight"
        >
          {renderInline(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push(
        <h2
          key={`h2-${i}`}
          className="text-lg font-semibold text-slate-100 mt-6 mb-2.5 pb-1.5 border-b border-[#1C2536]"
        >
          {renderInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push(
        <h3
          key={`h3-${i}`}
          className="text-base font-semibold text-cyan-300 mt-4 mb-2"
        >
          {renderInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    // Bullet list
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))
      ) {
        items.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push(
        <ul
          key={`ul-${i}`}
          className="my-2.5 ml-5 list-disc space-y-1.5 text-sm text-slate-300 max-w-[78ch]"
        >
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Blank
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    blocks.push(
      <p
        key={`p-${i}`}
        className="my-2.5 text-sm text-slate-300 leading-relaxed max-w-[78ch]"
      >
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5">{blocks}</div>;
};
