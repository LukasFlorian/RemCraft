/**
 * Small, dependency-free SVG charts (bar/stacked bar, heatmap) following the
 * project's data-viz rules: thin marks with rounded data ends, a 2px surface
 * gap between fills, recessive axes, a legend for ≥ 2 series, and a hover
 * tooltip on every mark.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** One series of a bar chart. */
export interface BarSeries {
  name: string;
  /** CSS colour (use the `--series-n` tokens). */
  color: string;
  values: number[];
}

/** Props of {@link BarChart}. */
export interface BarChartProps {
  labels: string[];
  series: BarSeries[];
  height?: number;
  /** Optional horizontal reference line (e.g. the daily goal). */
  goal?: number;
  /** Show every n-th x label. */
  labelEvery?: number;
  ariaLabel: string;
}

/**
 * Width of an element in CSS pixels (follows resizes). Charts draw in real
 * pixels, so text and bars are never stretched.
 */
function useWidth(fallback: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (): void => setWidth(Math.max(120, el.clientWidth || fallback));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, width];
}

/** Vertical (stacked) bar chart. */
export function BarChart({
  labels,
  series,
  height = 160,
  goal,
  labelEvery = 1,
  ariaLabel,
}: BarChartProps): ReactNode {
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
  const max = Math.max(1, goal ?? 0, ...totals);
  const [plotRef, width] = useWidth(600);
  const top = 8;
  const bottom = 22;
  const left = 30;
  const plotH = height - top - bottom;
  const slot = (width - left) / Math.max(1, n);
  const barW = Math.max(2, Math.min(28, slot - 4));
  const y = (v: number): number => top + plotH - (v / max) * plotH;
  // Unique ticks (for max = 1 the midpoint rounds onto the top).
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  return (
    <div className="chart">
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.name}>
              <i style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="chart-plot" ref={plotRef}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          style={{ height, width: '100%' }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={left - 6} y={y(t) + 4} className="chart-tick" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {goal !== undefined && goal > 0 && (
            <line x1={left} x2={width} y1={y(goal)} y2={y(goal)} className="chart-goal" />
          )}
          {labels.map((label, i) => {
            const x = left + i * slot + (slot - barW) / 2;
            let acc = 0;
            const segs = series
              .map((s) => {
                const v = s.values[i] ?? 0;
                const y0 = y(acc);
                acc += v;
                return { v, color: s.color, y1: y(acc), y0 };
              })
              .filter((s) => s.v > 0);
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={left + i * slot} y={top} width={slot} height={plotH} fill="transparent" />
                {segs.map((s, k) => {
                  const isTop = k === segs.length - 1;
                  // 2px surface gap between stacked fills.
                  const h = Math.max(1, s.y0 - s.y1 - (k > 0 ? 2 : 0));
                  return isTop ? (
                    <path
                      key={k}
                      d={roundedTop(x, s.y1, barW, h, Math.min(4, barW / 2, h))}
                      fill={s.color}
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  ) : (
                    <rect
                      key={k}
                      x={x}
                      y={s.y1}
                      width={barW}
                      height={h}
                      fill={s.color}
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  );
                })}
                {i % Math.max(labelEvery, Math.ceil((n * 44) / Math.max(1, width - left))) ===
                  0 && (
                  <text x={x + barW / 2} y={height - 6} className="chart-tick" textAnchor="middle">
                    {label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            className="chart-tooltip"
            style={{ left: `${((left + hover * slot + slot / 2) / width) * 100}%` }}
          >
            <strong>{labels[hover]}</strong>
            {series.map((s) => (
              <div key={s.name}>
                <i style={{ background: s.color }} /> {s.name}: {s.values[hover] ?? 0}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Path of a bar with rounded top corners, anchored to the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Props of {@link Heatmap}. */
export interface HeatmapProps {
  /** Days from oldest to newest (the last one is today). */
  days: { date: string; count: number }[];
  ariaLabel: string;
}

/** GitHub-style calendar heatmap of reviews per day (sequential, one hue). */
export function Heatmap({ days, ariaLabel }: HeatmapProps): ReactNode {
  const [hover, setHover] = useState<{ date: string; count: number } | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const level = (c: number): number =>
    c === 0 ? 0 : Math.min(4, 1 + Math.floor((c / max) * 3.999));
  const first = new Date(days[0]?.date ?? Date.now());
  const offset = (first.getDay() + 6) % 7; // Monday first
  const cells = [...Array<null>(offset).fill(null), ...days];
  const weeks = Math.ceil(cells.length / 7);
  const size = 11;
  const gap = 2;
  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${weeks * (size + gap)} ${7 * (size + gap)}`}
        role="img"
        aria-label={ariaLabel}
        className="heatmap"
      >
        {cells.map((d, i) =>
          d ? (
            <rect
              key={d.date}
              x={Math.floor(i / 7) * (size + gap)}
              y={(i % 7) * (size + gap)}
              width={size}
              height={size}
              rx={2}
              fill={`var(--seq-${level(d.count)})`}
              onMouseEnter={() => setHover(d)}
              onMouseLeave={() => setHover(null)}
            />
          ) : null,
        )}
      </svg>
      <div className="row faint" style={{ fontSize: 12, justifyContent: 'space-between' }}>
        <span>{hover ? `${hover.date}: ${hover.count} reviews` : 'Hover a day for details'}</span>
        <span className="row" style={{ gap: 3 }}>
          Less{' '}
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} className="heat-key" style={{ background: `var(--seq-${l})` }} />
          ))}{' '}
          More
        </span>
      </div>
    </div>
  );
}

/** A big number with a label (stat tile). */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}): ReactNode {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
