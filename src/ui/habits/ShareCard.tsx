/**
 * Share card of a habit: its tile grid with name, streaks and completions as
 * a PNG image (dark, light or in the habit's colour), to download or share
 * with the system share sheet.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Download, Share2 } from 'lucide-react';
import type { Habit } from '@core/model/types';
import { addDays, weekday } from '@core/habits/days';
import { isDone, streaks, streakUnit, totals } from '@core/habits/habits';
import type { HabitData } from '@core/habits/habits';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { HabitBadge } from './common';
import { t as tr } from '@core/i18n';

/** Card themes. */
type Theme = 'dark' | 'light' | 'color';

/** Colours of a theme. */
function palette(
  theme: Theme,
  color: string,
): { bg: string; fg: string; muted: string; empty: string; tile: string } {
  if (theme === 'light')
    return { bg: '#f7f7fb', fg: '#16161d', muted: '#6b6b7b', empty: '#e3e3ec', tile: color };
  if (theme === 'color')
    return {
      bg: color,
      fg: '#ffffff',
      muted: 'rgba(255,255,255,0.8)',
      empty: 'rgba(255,255,255,0.22)',
      tile: '#ffffff',
    };
  return { bg: '#16161d', fg: '#f4f4f8', muted: '#9a9aae', empty: '#2a2a36', tile: color };
}

/** Rounded rectangle path. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * Draws the card.
 *
 * Args:
 *   canvas: Target canvas (1080 × 1080 px).
 *   data: Habit data.
 *   theme: Card theme.
 *   weeks: Number of week columns.
 *   icon: The habit icon as an image (or null).
 */
export function drawShareCard(
  canvas: HTMLCanvasElement,
  data: HabitData,
  theme: Theme,
  weeks: number,
  icon: HTMLImageElement | null,
): void {
  const { habit } = data;
  const W = 1080;
  canvas.width = W;
  canvas.height = W;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const c = palette(theme, habit.color);
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, W);
  const pad = 80;
  const font = (size: number, weight = 600): string =>
    `${weight} ${size}px Inter, system-ui, -apple-system, Segoe UI, sans-serif`;

  // Header: icon tile, name, description.
  ctx.fillStyle = theme === 'color' ? 'rgba(255,255,255,0.2)' : `${habit.color}33`;
  roundRect(ctx, pad, pad, 110, 110, 28);
  ctx.fill();
  if (icon) ctx.drawImage(icon, pad + 25, pad + 25, 60, 60);
  ctx.fillStyle = c.fg;
  ctx.font = font(58, 700);
  ctx.fillText(habit.name.slice(0, 26), pad + 140, pad + 58);
  ctx.fillStyle = c.muted;
  ctx.font = font(32, 500);
  ctx.fillText((habit.description || '').slice(0, 48), pad + 140, pad + 102);

  // Grid: `weeks` columns ending with the current week.
  const gap = weeks > 30 ? 4 : 6;
  const tile = Math.floor((W - 2 * pad - (weeks - 1) * gap) / weeks);
  // Centre the grid between the header (≈ 240 px) and the numbers (≈ 820 px).
  const gridH = 7 * tile + 6 * gap;
  const gridTop = Math.round(250 + (540 - gridH) / 2);
  const lastMonday = addDays(data.today, -weekday(data.today));
  for (let w = 0; w < weeks; w++) {
    const monday = addDays(lastMonday, -7 * (weeks - 1 - w));
    for (let i = 0; i < 7; i++) {
      const day = addDays(monday, i);
      const x = pad + w * (tile + gap);
      const y = gridTop + i * (tile + gap);
      ctx.fillStyle =
        day <= data.today && day >= habit.startDay && isDone(data, day) ? c.tile : c.empty;
      roundRect(ctx, x, y, tile, tile, Math.max(2, tile / 4));
      ctx.fill();
    }
  }

  // Numbers.
  const s = streaks(data);
  const t = totals(data);
  const stats: [string, string][] = [
    [String(s.current), `Aktuelle Serie (${streakUnit(s.period, s.current)})`],
    [String(s.best), tr('Best streak')],
    [String(t.completions), tr('Completed')],
  ];
  const statsTop = W - pad - 110;
  const colW = (W - 2 * pad) / 3;
  stats.forEach(([value, label], i) => {
    ctx.fillStyle = c.fg;
    ctx.font = font(84, 800);
    ctx.fillText(value, pad + i * colW, statsTop);
    ctx.fillStyle = c.muted;
    ctx.font = font(28, 500);
    ctx.fillText(label, pad + i * colW, statsTop + 48);
  });

  ctx.fillStyle = c.muted;
  ctx.font = font(28, 600);
  ctx.textAlign = 'right';
  ctx.fillText('RemCraft', W - pad, W - pad + 20);
  ctx.textAlign = 'left';
}

/** Loads the rendered SVG of an element as an image (white or coloured). */
function svgImage(svg: SVGElement | null, color: string): Promise<HTMLImageElement | null> {
  if (!svg) return Promise.resolve(null);
  const clone = svg.cloneNode(true) as SVGElement;
  clone.setAttribute('stroke', color);
  clone.setAttribute('width', '60');
  clone.setAttribute('height', '60');
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The share dialog with preview. */
export function ShareCardDialog({
  habit,
  data,
  onClose,
}: {
  habit: Habit;
  data: HabitData;
  onClose: () => void;
}): ReactNode {
  const toast = useToast();
  const canvas = useRef<HTMLCanvasElement>(null);
  const iconHost = useRef<HTMLSpanElement>(null);
  const [theme, setTheme] = useState<Theme>('dark');
  const [weeks, setWeeks] = useState(26);

  useEffect(() => {
    let alive = true;
    const color = theme === 'color' ? '#ffffff' : habit.color;
    void svgImage(iconHost.current?.querySelector('svg') ?? null, color).then((img) => {
      if (alive && canvas.current) drawShareCard(canvas.current, data, theme, weeks, img);
    });
    return () => {
      alive = false;
    };
  }, [data, theme, weeks, habit.color]);

  const blob = (): Promise<Blob | null> =>
    new Promise((resolve) => canvas.current?.toBlob(resolve, 'image/png') ?? resolve(null));
  const fileName = `${habit.name.replace(/[^\w-]+/g, '_') || 'gewohnheit'}.png`;

  const download = async (): Promise<void> => {
    const b = await blob();
    if (!b) return;
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const share = async (): Promise<void> => {
    const b = await blob();
    if (!b) return;
    const file = new File([b], fileName, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: habit.name }).catch(() => undefined);
    } else {
      await download();
      toast(tr('Sharing is not supported here – the image was downloaded.'));
    }
  };

  return (
    <Modal
      title={tr('Share as image')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => void download()}>
            <Download size={14} /> {tr('Download')}
          </button>
          <button className="btn btn-primary" onClick={() => void share()}>
            <Share2 size={14} /> {tr('Share')}
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <span ref={iconHost} className="habit-share-icon-host" aria-hidden>
          <HabitBadge habit={habit} />
        </span>
        <canvas
          ref={canvas}
          className="habit-share-canvas"
          aria-label={tr('Preview of the share card')}
        />
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="segmented">
            {(
              [
                ['dark', tr('Dark')],
                ['light', tr('Light')],
                ['color', tr('Colour')],
              ] as [Theme, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                className={theme === id ? 'active' : ''}
                onClick={() => setTheme(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="segmented">
            {(
              [
                [13, '3 M'],
                [26, '6 M'],
                [52, '12 M'],
              ] as [number, string][]
            ).map(([n, label]) => (
              <button key={n} className={weeks === n ? 'active' : ''} onClick={() => setWeeks(n)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
