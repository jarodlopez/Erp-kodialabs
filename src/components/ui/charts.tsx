'use client';

import { useId, useMemo, useState } from 'react';

import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * Gráficos en SVG puro.
 * Se implementan sin librerías externas para mantener el bundle pequeño y
 * evitar dependencias que rompan el build. Todos reciben datos ya calculados
 * por el servidor a partir de la base de datos.
 */

export interface SeriesPoint {
  label: string;
  values: number[];
}

const PALETTE = ['#4f46e5', '#12b76a', '#f79009', '#f04438', '#7a5af8', '#06aed4'];

/** Gráfico de líneas con área, para series temporales. */
export function LineChart({
  points,
  seriesNames,
  currency = 'NIO',
  height = 220,
  className,
}: {
  points: SeriesPoint[];
  seriesNames: string[];
  currency?: string;
  height?: number;
  className?: string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const { paths, areas, max, width } = useMemo(() => {
    const count = Math.max(points.length, 2);
    const w = 100;
    const maxValue = Math.max(
      1,
      ...points.flatMap((p) => p.values.map((v) => Math.abs(v))),
    );

    const buildPath = (seriesIndex: number) =>
      points
        .map((point, index) => {
          const x = (index / (count - 1)) * w;
          const y = 100 - ((point.values[seriesIndex] ?? 0) / maxValue) * 92;
          return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');

    return {
      width: w,
      max: maxValue,
      paths: seriesNames.map((_, i) => buildPath(i)),
      areas: seriesNames.map((_, i) => `${buildPath(i)} L100,100 L0,100 Z`),
    };
  }, [points, seriesNames]);

  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--color-ink-subtle)]">
        Sin datos en el periodo seleccionado.
      </div>
    );
  }

  const active = hover !== null ? points[hover] : points[points.length - 1];

  return (
    <div className={cn('w-full', className)}>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {seriesNames.map((name, index) => (
          <div key={name} className="flex items-center gap-1.5 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
            />
            <span className="text-[var(--color-ink-subtle)]">{name}</span>
            <span className="font-semibold tabular text-[var(--color-ink)]">
              {formatMoney(active?.values[index] ?? 0, currency)}
            </span>
          </div>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${width} 100`}
        preserveAspectRatio="none"
        style={{ height }}
        className="w-full"
        role="img"
        aria-label="Gráfico de líneas"
      >
        <defs>
          {seriesNames.map((_, index) => (
            <linearGradient
              key={index}
              id={`${gradientId}-${index}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={PALETTE[index % PALETTE.length]}
                stopOpacity="0.18"
              />
              <stop offset="100%" stopColor={PALETTE[index % PALETTE.length]} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {[0, 25, 50, 75, 100].map((y) => (
          <line key={y} x1="0" y1={y} x2={width} y2={y} stroke="#eef0f3" strokeWidth="0.4" />
        ))}

        {areas.map((d, index) => (
          <path key={`area-${index}`} d={d} fill={`url(#${gradientId}-${index})`} />
        ))}
        {paths.map((d, index) => (
          <path
            key={`line-${index}`}
            d={d}
            fill="none"
            stroke={PALETTE[index % PALETTE.length]}
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {points.map((point, index) => (
          <rect
            key={point.label}
            x={(index / Math.max(points.length - 1, 1)) * width - 1}
            y={0}
            width={2}
            height={100}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      <div className="mt-2 flex justify-between text-[10px] text-[var(--color-ink-subtle)]">
        <span>{points[0]?.label}</span>
        <span>{active?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
      <p className="mt-1 text-[10px] text-[var(--color-ink-subtle)]">
        Máximo del periodo: {formatMoney(max, currency)}
      </p>
    </div>
  );
}

/** Barras horizontales para rankings (productos, categorías). */
export function BarList({
  items,
  currency = 'NIO',
  emptyMessage = 'Sin datos en el periodo.',
}: {
  items: { label: string; value: number; hint?: string }[];
  currency?: string;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-[var(--color-ink-subtle)]">{emptyMessage}</p>;
  }

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-[var(--color-ink)]">{item.label}</span>
            <span className="shrink-0 font-semibold tabular text-[var(--color-ink)]">
              {formatMoney(item.value, currency)}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-canvas)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((item.value / max) * 100, 2)}%`,
                backgroundColor: PALETTE[index % PALETTE.length],
              }}
            />
          </div>
          {item.hint && (
            <p className="mt-0.5 text-xs text-[var(--color-ink-subtle)]">{item.hint}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Anillo de composición (participación por categoría o cuenta). */
export function DonutChart({
  segments,
  currency = 'NIO',
  size = 160,
}: {
  segments: { label: string; value: number }[];
  currency?: string;
  size?: number;
}) {
  const total = segments.reduce((acc, s) => acc + Math.max(s.value, 0), 0);

  if (total <= 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-ink-subtle)]">
        Sin datos en el periodo.
      </p>
    );
  }

  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  // Los desplazamientos se calculan antes de renderizar para no mutar estado
  // durante el render.
  const arcs = segments.reduce<{ dash: number; offset: number }[]>((acc, segment) => {
    const previous = acc[acc.length - 1];
    const start = previous ? previous.offset + previous.dash : 0;
    const dash = (Math.max(segment.value, 0) / total) * circumference;
    acc.push({ dash, offset: start });
    return acc;
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Composición">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#eef0f3" strokeWidth="12" />
        {segments.map((segment, index) => (
          <circle
            key={segment.label}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={PALETTE[index % PALETTE.length]}
            strokeWidth="12"
            strokeDasharray={`${arcs[index].dash} ${circumference - arcs[index].dash}`}
            strokeDashoffset={-arcs[index].offset}
            transform="rotate(-90 50 50)"
          />
        ))}
        <text
          x="50"
          y="52"
          textAnchor="middle"
          className="fill-[var(--color-ink)]"
          style={{ fontSize: '9px', fontWeight: 600 }}
        >
          {formatMoney(total, currency)}
        </text>
      </svg>

      <ul className="flex-1 space-y-2 text-sm">
        {segments.map((segment, index) => (
          <li key={segment.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
              />
              <span className="truncate text-[var(--color-ink-muted)]">{segment.label}</span>
            </span>
            <span className="shrink-0 tabular text-[var(--color-ink)]">
              {Math.round((segment.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
