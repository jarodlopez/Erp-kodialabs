/**
 * Generador de PDF mínimo y sin dependencias.
 *
 * Produce un PDF 1.4 válido con tipografía Helvetica (incluida en todos los
 * lectores) y paginación automática de tablas. Se implementa a mano en lugar
 * de usar una librería para no añadir peso al bundle ni riesgo de
 * incompatibilidades en el build de Vercel.
 *
 * Limitación conocida y aceptada: al usar las fuentes estándar con
 * `WinAnsiEncoding`, los caracteres fuera de Latin-1 (por ejemplo emojis) se
 * sustituyen por un espacio.
 */

const PAGE_WIDTH = 595.28; // A4 vertical, en puntos
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const LINE_HEIGHT = 14;
const FONT_SIZE = 9;
const HEADER_FONT_SIZE = 9;

export interface PdfColumn<T> {
  header: string;
  width: number;
  align?: 'left' | 'right';
  value: (row: T) => string;
}

export interface PdfDocumentInput<T> {
  title: string;
  subtitle?: string;
  organizationName: string;
  columns: PdfColumn<T>[];
  rows: T[];
  /** Líneas de totales que se imprimen al final del documento. */
  summary?: { label: string; value: string }[];
  generatedAt?: string;
}

/** Escapa los caracteres especiales de una cadena literal PDF. */
function escapeText(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 32;
    if (char === '(' || char === ')' || char === '\\') out += `\\${char}`;
    else if (code < 32) out += ' ';
    else if (code <= 255) out += char;
    else out += ' ';
  }
  return out;
}

function truncate(value: string, width: number, fontSize: number): string {
  // Aproximación: Helvetica ocupa ~0.5 em por carácter.
  const maxChars = Math.max(1, Math.floor(width / (fontSize * 0.5)));
  return value.length > maxChars ? `${value.slice(0, maxChars - 1)}…`.replace('…', '..') : value;
}

export function buildPdf<T>(input: PdfDocumentInput<T>): Buffer {
  const { columns, rows } = input;
  const usableWidth = PAGE_WIDTH - MARGIN * 2;
  const totalWidth = columns.reduce((acc, column) => acc + column.width, 0);
  const scale = totalWidth > 0 ? usableWidth / totalWidth : 1;
  const widths = columns.map((column) => column.width * scale);

  const rowsPerPage = Math.floor((PAGE_HEIGHT - MARGIN * 2 - 90) / LINE_HEIGHT);
  const pageChunks: T[][] = [];
  for (let i = 0; i < rows.length; i += rowsPerPage) {
    pageChunks.push(rows.slice(i, i + rowsPerPage));
  }
  if (pageChunks.length === 0) pageChunks.push([]);

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const contents: string[] = [];

  pageChunks.forEach((chunk, pageIndex) => {
    const parts: string[] = [];
    let y = PAGE_HEIGHT - MARGIN;

    // Encabezado del documento
    parts.push(
      `BT /F2 16 Tf 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (${escapeText(input.title)}) Tj ET`,
    );
    y -= 18;
    parts.push(
      `BT /F1 9 Tf 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (${escapeText(
        input.organizationName,
      )}) Tj ET`,
    );
    y -= 12;
    if (input.subtitle) {
      parts.push(
        `BT /F1 9 Tf 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (${escapeText(input.subtitle)}) Tj ET`,
      );
      y -= 12;
    }
    parts.push(
      `BT /F1 8 Tf 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (${escapeText(
        `Generado: ${new Date(generatedAt).toLocaleString('es-NI')}`,
      )}) Tj ET`,
    );
    y -= 18;

    // Cabecera de la tabla
    parts.push(`0.85 0.87 0.9 rg ${MARGIN} ${(y - 4).toFixed(2)} ${usableWidth.toFixed(2)} 16 re f`);
    parts.push('0 0 0 rg');

    let x = MARGIN;
    columns.forEach((column, index) => {
      const text = truncate(column.header, widths[index], HEADER_FONT_SIZE);
      const posX =
        column.align === 'right'
          ? x + widths[index] - text.length * HEADER_FONT_SIZE * 0.5 - 4
          : x + 3;
      parts.push(
        `BT /F2 ${HEADER_FONT_SIZE} Tf 1 0 0 1 ${posX.toFixed(2)} ${y.toFixed(2)} Tm (${escapeText(
          text,
        )}) Tj ET`,
      );
      x += widths[index];
    });
    y -= LINE_HEIGHT + 2;

    // Filas
    for (const row of chunk) {
      x = MARGIN;
      columns.forEach((column, index) => {
        const raw = column.value(row) ?? '';
        const text = truncate(raw, widths[index], FONT_SIZE);
        const posX =
          column.align === 'right'
            ? x + widths[index] - text.length * FONT_SIZE * 0.5 - 4
            : x + 3;
        parts.push(
          `BT /F1 ${FONT_SIZE} Tf 1 0 0 1 ${posX.toFixed(2)} ${y.toFixed(2)} Tm (${escapeText(
            text,
          )}) Tj ET`,
        );
        x += widths[index];
      });
      y -= LINE_HEIGHT;
    }

    // Totales solo en la última página
    if (pageIndex === pageChunks.length - 1 && input.summary?.length) {
      y -= 8;
      parts.push(
        `0.8 0.82 0.85 RG ${MARGIN} ${y.toFixed(2)} m ${(MARGIN + usableWidth).toFixed(
          2,
        )} ${y.toFixed(2)} l S`,
      );
      y -= 16;
      for (const item of input.summary) {
        parts.push(
          `BT /F2 10 Tf 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (${escapeText(item.label)}) Tj ET`,
        );
        parts.push(
          `BT /F2 10 Tf 1 0 0 1 ${(MARGIN + usableWidth - item.value.length * 5).toFixed(
            2,
          )} ${y.toFixed(2)} Tm (${escapeText(item.value)}) Tj ET`,
        );
        y -= LINE_HEIGHT;
      }
    }

    // Pie de página
    parts.push(
      `BT /F1 8 Tf 1 0 0 1 ${MARGIN} ${(MARGIN - 10).toFixed(2)} Tm (${escapeText(
        `Página ${pageIndex + 1} de ${pageChunks.length}`,
      )}) Tj ET`,
    );

    contents.push(parts.join('\n'));
  });

  // ------------------------- Ensamblado del archivo -------------------------
  const objects: string[] = [];
  const pageCount = contents.length;

  const pageObjectIds = contents.map((_, index) => 3 + index * 2);
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(' ');

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);

  contents.forEach((content, index) => {
    const contentId = 4 + index * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${3 + pageCount * 2} 0 R /F2 ${4 + pageCount * 2} 0 R >> >> ` +
        `/Contents ${contentId} 0 R >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
  });

  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

export function pdfResponse(filename: string, buffer: Buffer): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
