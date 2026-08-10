'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Download, Upload } from 'lucide-react';

import {
  importProductsAction,
  type ImportRowResult,
  type ProductImportRow,
} from '@/app/actions/catalog';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  TableWrapper,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

/** Columnas canónicas que entiende la importación. */
const FIELDS = [
  'sku',
  'nombre',
  'codigo_barras',
  'categoria',
  'unidad',
  'precio_venta',
  'costo',
  'precio_mayorista',
  'iva',
  'stock_inicial',
  'stock_minimo',
  'marca',
  'descripcion',
] as const;

type Field = (typeof FIELDS)[number];

/** Sinónimos aceptados en el encabezado → nombre de columna canónico. */
const HEADER_ALIASES: Record<string, Field> = {
  sku: 'sku',
  codigo: 'sku',
  nombre: 'nombre',
  producto: 'nombre',
  codigo_barras: 'codigo_barras',
  codigo_de_barras: 'codigo_barras',
  barcode: 'codigo_barras',
  categoria: 'categoria',
  unidad: 'unidad',
  precio_venta: 'precio_venta',
  precio: 'precio_venta',
  precio_de_venta: 'precio_venta',
  costo: 'costo',
  precio_mayorista: 'precio_mayorista',
  mayorista: 'precio_mayorista',
  iva: 'iva',
  impuesto: 'iva',
  stock_inicial: 'stock_inicial',
  stock: 'stock_inicial',
  existencias: 'stock_inicial',
  stock_minimo: 'stock_minimo',
  minimo: 'stock_minimo',
  marca: 'marca',
  descripcion: 'descripcion',
};

const TEMPLATE =
  'sku,nombre,codigo_barras,categoria,unidad,precio_venta,costo,precio_mayorista,iva,stock_inicial,stock_minimo,marca,descripcion\n' +
  'P001,Martillo de carpintero,7501234567890,Herramientas,Unidad,150.00,90.00,135.00,15,25,5,Truper,Martillo con mango de fibra 16oz\n' +
  'P002,Tornillo 1/2 pulgada,,Ferretería,Unidad,2.50,1.20,,15,500,100,,Caja de 100 unidades\n';

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

/** Parser CSV mínimo que respeta comillas y saltos de línea dentro de celdas. */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export function ImportProducts() {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ProductImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ created: number; results: ImportRowResult[] } | null>(
    null,
  );

  function downloadTemplate() {
    const blob = new Blob(['﻿' + TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-productos.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setResults(null);
    setParseError(null);
    setFileName(file.name);

    const text = await file.text();
    const firstLine = text.split('\n')[0] ?? '';
    const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
    const matrix = parseCsv(text, delimiter);

    if (matrix.length < 2) {
      setRows([]);
      setParseError('El archivo no tiene datos (se esperaba un encabezado y al menos una fila).');
      return;
    }

    const headers = matrix[0].map((h) => HEADER_ALIASES[normalizeHeader(h)]);
    if (!headers.includes('sku') || !headers.includes('nombre') || !headers.includes('precio_venta')) {
      setRows([]);
      setParseError(
        'Faltan columnas obligatorias. El encabezado debe incluir al menos: sku, nombre y precio_venta. Descarga la plantilla como referencia.',
      );
      return;
    }

    const parsed: ProductImportRow[] = matrix.slice(1).map((cells) => {
      const obj: ProductImportRow = {};
      headers.forEach((field, index) => {
        if (field) obj[field] = (cells[index] ?? '').trim();
      });
      return obj;
    });

    setRows(parsed);
  }

  async function runImport() {
    if (loading || rows.length === 0) return;
    setLoading(true);
    const result = await importProductsAction(rows);
    setLoading(false);

    if (!result.ok) {
      toast.error('No se pudo importar', result.error.message);
      return;
    }
    setResults(result.data);
    const failed = result.data.results.filter((r) => !r.ok).length;
    if (failed === 0) {
      toast.success('Importación completada', `${result.data.created} producto(s) creado(s).`);
    } else {
      toast.warning(
        'Importación parcial',
        `${result.data.created} creado(s), ${failed} con error.`,
      );
    }
    router.refresh();
  }

  function reset() {
    setRows([]);
    setResults(null);
    setFileName('');
    setParseError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const failedResults = results?.results.filter((r) => !r.ok) ?? [];
  const notes = results?.results.filter((r) => r.ok && r.note) ?? [];

  return (
    <div className="space-y-4">
      {/* Guía de formato */}
      <Card>
        <CardHeader
          title="Formato del archivo"
          description="Un archivo CSV con una fila por producto. Descarga la plantilla y complétala."
          actions={
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> Descargar plantilla
            </Button>
          }
        />
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-ink-subtle)]">
                <th className="px-2 py-1.5">Columna</th>
                <th className="px-2 py-1.5">Obligatoria</th>
                <th className="px-2 py-1.5">Descripción</th>
              </tr>
            </thead>
            <tbody className="text-[var(--color-ink-muted)]">
              {[
                ['sku', 'Sí', 'Código interno único del producto (ej. P001).'],
                ['nombre', 'Sí', 'Nombre del producto.'],
                ['precio_venta', 'Sí', 'Precio de venta. Usa punto decimal, sin separador de miles (ej. 150.00).'],
                ['costo', 'No', 'Costo de compra. Por defecto 0.'],
                ['codigo_barras', 'No', 'Código de barras para el escáner.'],
                ['categoria', 'No', 'Nombre de una categoría que ya exista; si no existe, se ignora.'],
                ['unidad', 'No', 'Unidad, Caja, Paquete, Kilogramo, Gramo, Litro, Metro o Servicio. Por defecto Unidad.'],
                ['precio_mayorista', 'No', 'Precio mayorista. Por defecto 0.'],
                ['iva', 'No', 'Porcentaje de impuesto (ej. 15 para 15%). Por defecto 0.'],
                ['stock_inicial', 'No', 'Existencias iniciales. Por defecto 0.'],
                ['stock_minimo', 'No', 'Nivel para alerta de stock bajo. Por defecto 0.'],
                ['marca', 'No', 'Marca del producto.'],
                ['descripcion', 'No', 'Descripción libre.'],
              ].map(([col, req, desc]) => (
                <tr key={col} className="border-t border-[var(--color-border)]">
                  <td className="px-2 py-1.5 font-mono text-xs text-[var(--color-ink)]">{col}</td>
                  <td className="px-2 py-1.5">
                    {req === 'Sí' ? (
                      <Badge tone="brand">Sí</Badge>
                    ) : (
                      <span className="text-[var(--color-ink-subtle)]">No</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-[var(--color-ink-subtle)]">
            Consejo: guarda el archivo como CSV (UTF-8). El orden de las columnas no importa; se
            identifican por el nombre del encabezado. Máximo 500 productos por archivo.
          </p>
        </div>
      </Card>

      {/* Carga del archivo */}
      <Card>
        <CardHeader title="Subir archivo" />
        <div className="p-4">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="block w-full text-sm text-[var(--color-ink-muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-brand-500)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[var(--color-brand-600)]"
          />
          {fileName && (
            <p className="mt-2 text-xs text-[var(--color-ink-subtle)]">
              Archivo: {fileName} · {rows.length} fila(s) detectada(s)
            </p>
          )}
          {parseError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--color-danger-50)] p-3 text-sm text-[var(--color-danger-700)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Vista previa */}
      {rows.length > 0 && !results && (
        <Card>
          <CardHeader
            title="Vista previa"
            description={`Se importarán ${rows.length} producto(s). Se muestran las primeras 20 filas.`}
            actions={
              <Button onClick={runImport} loading={loading}>
                <Upload className="h-4 w-4" /> Importar {rows.length} producto(s)
              </Button>
            }
          />
          <TableWrapper>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Nombre</Th>
                <Th align="right">Precio</Th>
                <Th align="right">Stock inicial</Th>
                <Th>Categoría</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((row, index) => (
                <Tr key={index}>
                  <Td className="font-mono text-xs">{row.sku || '—'}</Td>
                  <Td>{row.nombre || <span className="text-[var(--color-danger-700)]">(falta)</span>}</Td>
                  <Td align="right">{row.precio_venta || '—'}</Td>
                  <Td align="right">{row.stock_inicial || '0'}</Td>
                  <Td>{row.categoria || '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </TableWrapper>
        </Card>
      )}

      {/* Resultados */}
      {results && (
        <Card>
          <CardHeader title="Resultado de la importación" />
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-2 rounded-lg bg-[var(--color-positive-50)] p-3 text-sm text-[var(--color-positive-700)]">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>
                {results.created} producto(s) creado(s) correctamente
                {failedResults.length > 0 ? ` · ${failedResults.length} con error` : ''}.
              </span>
            </div>

            {notes.length > 0 && (
              <div className="rounded-lg bg-[var(--color-warning-50)] p-3 text-sm text-[var(--color-warning-700)]">
                <p className="font-medium">Avisos:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {notes.map((n) => (
                    <li key={n.line}>
                      Fila {n.line} ({n.sku}): {n.note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {failedResults.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-[var(--color-ink)]">Filas con error</p>
                <TableWrapper>
                  <thead>
                    <tr>
                      <Th>Fila</Th>
                      <Th>SKU</Th>
                      <Th>Error</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedResults.map((r) => (
                      <Tr key={r.line}>
                        <Td>{r.line}</Td>
                        <Td className="font-mono text-xs">{r.sku || '—'}</Td>
                        <Td className="text-[var(--color-danger-700)]">{r.error}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </TableWrapper>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" onClick={reset}>
                Importar otro archivo
              </Button>
              <Link href="/inventario">
                <Button variant="ghost">Ir al inventario</Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      {rows.length === 0 && !parseError && !results && (
        <EmptyState
          title="Aún no has cargado un archivo"
          description="Descarga la plantilla, complétala con tus productos y súbela aquí."
        />
      )}
    </div>
  );
}
