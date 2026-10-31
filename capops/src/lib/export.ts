// One report model, rendered to both Word (.docx) and PDF.
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { jsPDF } from 'jspdf';
import type { DocContent } from './types';

export type Block =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'p'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'table'; head: string[]; rows: (string | number | null)[][] };

export interface ReportModel { title: string; subtitle?: string; meta?: string; blocks: Block[] }

const NAVY = '1B2A4E';
const BRASS = 'C9A227';

/** Turn an editable document body into blocks: "- " lines → bullets, others → paragraphs. */
export function bodyToBlocks(body: string): Block[] {
  const out: Block[] = [];
  let bullets: string[] = [];
  const flush = () => { if (bullets.length) { out.push({ type: 'bullets', items: bullets }); bullets = []; } };
  for (const raw of body.split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*[-•*]\s+/.test(line)) bullets.push(line.replace(/^\s*[-•*]\s+/, ''));
    else if (!line.trim()) flush();
    else { flush(); out.push({ type: 'p', text: line.trim() }); }
  }
  flush();
  return out;
}

export function docToReport(title: string, content: DocContent, subtitle?: string, meta?: string): ReportModel {
  const blocks: Block[] = [];
  for (const s of content.sections) {
    blocks.push({ type: 'h2', text: s.heading });
    blocks.push(...bodyToBlocks(s.body));
  }
  return { title, subtitle, meta, blocks };
}

const cellText = (v: string | number | null) => (v === null || v === undefined || v === '' ? '—' : String(v));

export async function downloadDocx(model: ReportModel, filename: string) {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ children: [new TextRun({ text: 'METE CAP/OPS™', bold: true, color: '7D6213', size: 18 })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: model.title, bold: true, color: NAVY, size: 44, font: 'Georgia' })] }),
  ];
  if (model.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: model.subtitle, size: 24, color: '566172' })] }));
  if (model.meta) children.push(new Paragraph({ children: [new TextRun({ text: model.meta, size: 18, color: '566172' })] }));
  children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRASS, space: 4 } }, children: [] }));

  for (const b of model.blocks) {
    if (b.type === 'h1') children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320 }, children: [new TextRun({ text: b.text, color: NAVY, bold: true, size: 32, font: 'Georgia' })] }));
    else if (b.type === 'h2') children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: [new TextRun({ text: b.text, color: NAVY, bold: true, size: 26 })] }));
    else if (b.type === 'p') children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: b.text, size: 22 })] }));
    else if (b.type === 'bullets') b.items.forEach((t) => children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: t, size: 22 })] })));
    else if (b.type === 'table') {
      const header = new TableRow({ tableHeader: true, children: b.head.map((h) => new TableCell({ shading: { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })] })] })) });
      const rows = b.rows.map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cellText(c), size: 18 })] })] })) }));
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] }));
      children.push(new Paragraph({ children: [] }));
    }
  }
  children.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 400 }, children: [new TextRun({ text: 'Prepared with METE CAP/OPS™ — Mete, Benefits Corporation. Review all recommendations before acting; verify legal, tax and licensing items with the proper authority.', italics: true, size: 16, color: '566172' })] }));

  const doc = new Document({ creator: 'METE CAP/OPS', title: model.title, sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveBlob(blob, `${filename}.docx`);
}

export function downloadPdf(model: ReportModel, filename: string) {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 54;
  const maxW = W - M * 2;
  let y = M;

  const ensure = (h: number) => { if (y + h > H - M) { pdf.addPage(); y = M; } };
  const write = (text: string, size: number, opts: { bold?: boolean; color?: [number, number, number]; indent?: number; font?: string; gap?: number } = {}) => {
    pdf.setFont(opts.font ?? 'helvetica', opts.bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...(opts.color ?? [35, 44, 58]));
    const lines = pdf.splitTextToSize(text, maxW - (opts.indent ?? 0)) as string[];
    const lh = size * 1.35;
    for (const l of lines) { ensure(lh); pdf.text(l, M + (opts.indent ?? 0), y + size); y += lh; }
    y += opts.gap ?? 4;
  };

  write('METE CAP/OPS™', 9, { bold: true, color: [125, 98, 19] });
  write(model.title, 22, { bold: true, color: [27, 42, 78], font: 'times' });
  if (model.subtitle) write(model.subtitle, 12, { color: [86, 97, 114] });
  if (model.meta) write(model.meta, 9, { color: [86, 97, 114] });
  pdf.setDrawColor(201, 162, 39); pdf.setLineWidth(2); pdf.line(M, y, W - M, y); y += 14;

  for (const b of model.blocks) {
    if (b.type === 'h1') { y += 8; write(b.text, 16, { bold: true, color: [27, 42, 78], font: 'times', gap: 6 }); }
    else if (b.type === 'h2') { y += 6; write(b.text, 12.5, { bold: true, color: [27, 42, 78], gap: 4 }); }
    else if (b.type === 'p') write(b.text, 10.5, { gap: 6 });
    else if (b.type === 'bullets') { b.items.forEach((t) => write(`•  ${t}`, 10.5, { indent: 10, gap: 2 })); y += 4; }
    else if (b.type === 'table') {
      const cols = b.head.length;
      const colW = maxW / cols;
      const rowH = (cells: string[], size: number) => Math.max(...cells.map((c) => (pdf.splitTextToSize(c, colW - 8) as string[]).length)) * size * 1.3 + 8;
      const drawRow = (cells: string[], header: boolean) => {
        const size = 8.5;
        pdf.setFontSize(size); pdf.setFont('helvetica', header ? 'bold' : 'normal');
        const h = rowH(cells, size);
        ensure(h);
        if (header) { pdf.setFillColor(27, 42, 78); pdf.rect(M, y, maxW, h, 'F'); pdf.setTextColor(255, 255, 255); }
        else { pdf.setDrawColor(226, 220, 207); pdf.setLineWidth(0.5); pdf.line(M, y + h, M + maxW, y + h); pdf.setTextColor(35, 44, 58); }
        cells.forEach((c, i) => { const lines = pdf.splitTextToSize(c, colW - 8) as string[]; pdf.text(lines, M + i * colW + 4, y + 4 + size); });
        y += h;
      };
      drawRow(b.head, true);
      b.rows.forEach((r) => drawRow(r.map(cellText), false));
      y += 10;
    }
  }
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(86, 97, 114); pdf.setFont('helvetica', 'normal');
    pdf.text(`${model.title} · Page ${i} of ${pages}`, M, H - 28);
  }
  pdf.save(`${filename}.pdf`);
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'report';
