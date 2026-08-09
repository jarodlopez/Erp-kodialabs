'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';

import { Button, Select } from '@/components/ui/primitives';

const REPORT_TYPES = [
  { value: 'ventas', label: 'Ventas (documentos)' },
  { value: 'ventas-producto', label: 'Ventas por producto' },
  { value: 'compras', label: 'Compras' },
  { value: 'gastos', label: 'Gastos' },
  { value: 'inventario', label: 'Valoración de inventario' },
  { value: 'cuentas-por-cobrar', label: 'Cuentas por cobrar' },
  { value: 'cuentas-por-pagar', label: 'Cuentas por pagar' },
];

const TAB_TO_TYPE: Record<string, string> = {
  ventas: 'ventas',
  productos: 'ventas-producto',
  compras: 'compras',
  inventario: 'inventario',
  finanzas: 'gastos',
};

/** Descarga de reportes en CSV o PDF generados por el servidor. */
export function ExportMenu({ from, to, tab }: { from: string; to: string; tab: string }) {
  const [type, setType] = useState(TAB_TO_TYPE[tab] ?? 'ventas');

  const href = (format: 'csv' | 'pdf') =>
    `/api/reportes/export?tipo=${type}&formato=${format}&from=${from}&to=${to}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={type}
        onChange={(event) => setType(event.target.value)}
        className="w-auto min-w-[200px]"
        aria-label="Reporte a exportar"
      >
        {REPORT_TYPES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <a href={href('csv')} download>
        <Button variant="secondary">
          <FileSpreadsheet className="h-4 w-4" /> CSV
        </Button>
      </a>
      <a href={href('pdf')} download>
        <Button variant="secondary">
          <FileText className="h-4 w-4" /> PDF
        </Button>
      </a>
      <span className="hidden items-center text-xs text-[var(--color-ink-subtle)] sm:flex">
        <Download className="mr-1 h-3.5 w-3.5" /> Datos reales del periodo
      </span>
    </div>
  );
}
