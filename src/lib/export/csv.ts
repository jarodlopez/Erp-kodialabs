/**
 * Generación de CSV compatible con Excel en español.
 * Se antepone el BOM UTF-8 para que los acentos se muestren correctamente.
 */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[], separator = ';'): string {
  const header = columns.map((column) => escapeCell(column.header)).join(separator);
  const body = rows
    .map((row) => columns.map((column) => escapeCell(column.value(row))).join(separator))
    .join('\r\n');
  return `\uFEFF${header}\r\n${body}`;
}

export function csvResponse(filename: string, content: string): Response {
  return new Response(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
