/**
 * A slide with its annotation layers (ported from Fokus `slides.js`,
 * `ink.js`, `textboxes.js`, `textlayer.js`):
 *
 * - the rendered slide image,
 * - a selectable text layer with coloured highlights,
 * - pen / marker / eraser drawings,
 * - movable text boxes ("sticky notes") with Markdown-ish text.
 *
 * All coordinates are relative to the slide (0..1), so annotations look the
 * same at every size, on every device and in the handout.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Copy, MessageSquareText, Sparkles, StickyNote, Trash2 } from 'lucide-react';
import type { Rem, RemId, Stroke, TextBox, TextMark } from '@core/model/types';
import { newId } from '@core/util/ids';
import { useApp, useSelector } from '../app/context';
import { useSlideImage, useSlideText } from './useSlides';
import { t as tr } from '@core/i18n';

/** Drawing / editing tools. */
export type SlideTool = 'select' | 'pen' | 'marker' | 'eraser' | 'text';

/** Pen colours (Fokus palette). */
export const PEN_COLORS = ['#ff3b30', '#ffb020', '#39c6b3', '#3b82f6', '#111111'];
/** Highlight colours for selected slide text. */
export const MARK_COLORS = ['#ffd60a', '#7ee081', '#7cc4ff', '#ff8fab'];

/** Props of {@link SlideView}. */
export interface SlideViewProps {
  deckId: RemId;
  slide: Rem | undefined;
  /** Interactive (current slide) or a passive preview. */
  interactive?: boolean;
  tool?: SlideTool;
  color?: string;
  /** Text selected on the slide was sent somewhere (`note` / `ai`). */
  onTextAction?: (action: 'note' | 'ai', text: string) => void;
  className?: string;
  /** Rendering width hint (CSS px). */
  width?: number;
  /**
   * Size relative to the container width (height from the slide's aspect
   * ratio) instead of fitting into a fixed box - for documents and printing,
   * where the available width changes after layout (print preview).
   */
  fluid?: boolean;
}

/** Fits a box of aspect `ratio` into `w × h`. */
function fit(
  w: number,
  h: number,
  ratio: number,
): { width: number; height: number; left: number; top: number } {
  let width = w;
  let height = w / ratio;
  if (height > h) {
    height = h;
    width = h * ratio;
  }
  return { width, height, left: (w - width) / 2, top: (h - height) / 2 };
}

/** The slide view. */
export function SlideView({
  deckId,
  slide,
  interactive = false,
  tool = 'select',
  color = PEN_COLORS[0]!,
  onTextAction,
  className,
  width = 900,
  fluid = false,
}: SlideViewProps): ReactNode {
  const app = useApp();
  const hostRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState({ w: 0, h: 0 });
  const [ratio, setRatio] = useState(16 / 9);
  const url = useSlideImage(deckId, slide, Math.max(width, host.w));
  const items = useSlideText(interactive ? deckId : null, slide);
  const ann = useSelector((s) => (slide ? s.getRecord('annotations', slide.id) : undefined));

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHost({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setHost({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const stage = fluid
    ? { width: host.w, height: host.w / ratio, left: 0, top: 0 }
    : fit(host.w, host.h || host.w / ratio, ratio);
  const save = (
    patch: Partial<{ strokes: Stroke[]; boxes: TextBox[]; marks: TextMark[] }>,
  ): void => {
    if (slide) app.lectures.setAnnotations(slide.id, patch);
  };

  return (
    <div
      ref={hostRef}
      className={`slide-view${fluid ? ' fluid' : ''}${className ? ` ${className}` : ''}`}
    >
      {!slide && <div className="slide-empty faint">{tr('No slide')}</div>}
      {slide && (
        <div
          className="slide-stage"
          style={{ width: stage.width, height: stage.height, left: stage.left, top: stage.top }}
        >
          {url ? (
            <img
              src={url}
              alt={tr('Slide {0}', { '0': (slide.slide?.index ?? 0) + 1 })}
              draggable={false}
              onLoad={(e) =>
                setRatio(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))
              }
            />
          ) : (
            <div className="slide-loading faint">{tr('Loading slide…')}</div>
          )}
          <MarksLayer
            marks={ann?.marks ?? []}
            interactive={interactive}
            onChange={(marks) => save({ marks })}
          />
          {interactive && tool === 'select' && (
            <TextLayer
              items={items}
              onHighlight={(m) => save({ marks: [...(ann?.marks ?? []), m] })}
              onTextAction={onTextAction}
            />
          )}
          <InkLayer
            strokes={ann?.strokes ?? []}
            tool={interactive ? tool : 'select'}
            color={color}
            size={stage}
            onChange={(strokes) => save({ strokes })}
          />
          <TextBoxesLayer
            boxes={ann?.boxes ?? []}
            tool={interactive ? tool : 'select'}
            interactive={interactive}
            onChange={(edit, coalesceKey) => {
              // Applied to the stored boxes, not to the rendered ones: a
              // handler may run after a newer edit (e.g. a blur after the
              // next box was created) and must not overwrite it.
              if (!slide) return;
              const current = app.lectures.annotations(slide.id).boxes;
              app.lectures.setAnnotations(slide.id, { boxes: edit(current) }, { coalesceKey });
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ink
// ---------------------------------------------------------------------------

/** Pen, marker and eraser on a canvas. */
function InkLayer({
  strokes,
  tool,
  color,
  size,
  onChange,
}: {
  strokes: Stroke[];
  tool: SlideTool;
  color: string;
  size: { width: number; height: number };
  onChange: (s: Stroke[]) => void;
}): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null);
  const current = useRef<Stroke | null>(null);
  const drawing = tool === 'pen' || tool === 'marker' || tool === 'eraser';

  /** Redraws all strokes. */
  const redraw = (): void => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of [...strokes, ...(current.current ? [current.current] : [])]) {
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = s.tool === 'marker' ? 0.35 : 1;
      ctx.lineWidth = s.width * canvas.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < s.p.length; i += 2) {
        const x = s.p[i]! * canvas.width;
        const y = s.p[i + 1]! * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (s.p.length === 2) ctx.lineTo(s.p[0]! * canvas.width + 0.1, s.p[1]! * canvas.height);
      ctx.stroke();
      ctx.restore();
    }
  };
  useEffect(redraw);

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    ];
  };
  /** Removes strokes passing near a point. */
  const erase = (x: number, y: number): void => {
    const near = (s: Stroke): boolean => {
      for (let i = 0; i < s.p.length; i += 2)
        if (
          Math.hypot(s.p[i]! - x, (s.p[i + 1]! - y) * (size.height / Math.max(1, size.width))) <
          0.015
        )
          return true;
      return false;
    };
    const kept = strokes.filter((s) => !near(s));
    if (kept.length !== strokes.length) onChange(kept);
  };

  return (
    <canvas
      ref={ref}
      className={`ink-layer${drawing ? ' active' : ''}`}
      style={{ cursor: tool === 'eraser' ? 'cell' : drawing ? 'crosshair' : undefined }}
      onPointerDown={(e) => {
        if (!drawing) return;
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const [x, y] = pos(e);
        if (tool === 'eraser') return erase(x, y);
        current.current = {
          tool: tool === 'marker' ? 'marker' : 'pen',
          color,
          width: tool === 'marker' ? 0.018 : 0.003,
          p: [x, y],
        };
        redraw();
      }}
      onPointerMove={(e) => {
        if (!drawing || !(e.buttons & 1)) return;
        const [x, y] = pos(e);
        if (tool === 'eraser') return erase(x, y);
        if (!current.current) return;
        current.current.p.push(Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000);
        redraw();
      }}
      onPointerUp={() => {
        if (current.current) onChange([...strokes, current.current]);
        current.current = null;
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Text layer + highlights
// ---------------------------------------------------------------------------

/** Transparent, selectable text over the slide; selection → highlight/note/AI. */
function TextLayer({
  items,
  onHighlight,
  onTextAction,
}: {
  items: { str: string; x0: number; y0: number; x1: number; y1: number }[];
  onHighlight: (m: TextMark) => void;
  onTextAction: SlideViewProps['onTextAction'];
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{
    text: string;
    rects: [number, number, number, number][];
    x: number;
    y: number;
  } | null>(null);
  return (
    <div
      ref={ref}
      className="text-layer"
      onMouseUp={() => {
        const s = window.getSelection();
        const layer = ref.current;
        if (!s || s.isCollapsed || !layer || !layer.contains(s.anchorNode)) return setSel(null);
        const box = layer.getBoundingClientRect();
        const rects = [...s.getRangeAt(0).getClientRects()]
          .filter((r) => r.width > 1)
          .map(
            (r) =>
              [
                (r.left - box.left) / box.width,
                (r.top - box.top) / box.height,
                r.width / box.width,
                r.height / box.height,
              ] as [number, number, number, number],
          );
        if (!rects.length) return setSel(null);
        const last = s.getRangeAt(0).getBoundingClientRect();
        setSel({
          text: s.toString().replace(/\s+/g, ' ').trim(),
          rects,
          x: last.left - box.left + last.width / 2,
          y: last.top - box.top,
        });
      }}
    >
      {items.map((t, i) => (
        <span
          key={i}
          style={{
            left: `${t.x0 * 100}%`,
            top: `${t.y0 * 100}%`,
            width: `${(t.x1 - t.x0) * 100}%`,
            height: `${(t.y1 - t.y0) * 100}%`,
            fontSize: `calc(${(t.y1 - t.y0) * 100}cqh * 0.9)`,
          }}
        >
          {t.str}
        </span>
      ))}
      {sel && (
        <div
          className="selection-bar"
          style={{ left: sel.x, top: Math.max(0, sel.y - 40) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {MARK_COLORS.map((c) => (
            <button
              key={c}
              className="mark-swatch"
              style={{ background: c }}
              aria-label={tr('Highlight')}
              onClick={() => {
                onHighlight({ id: newId(8), c, text: sel.text, rects: sel.rects });
                window.getSelection()?.removeAllRanges();
                setSel(null);
              }}
            />
          ))}
          <button
            className="icon-btn"
            title={tr('To notes')}
            onClick={() => (onTextAction?.('note', sel.text), setSel(null))}
          >
            <MessageSquareText size={15} />
          </button>
          <button
            className="icon-btn"
            title={tr('Ask AI')}
            onClick={() => (onTextAction?.('ai', sel.text), setSel(null))}
          >
            <Sparkles size={15} />
          </button>
          <button
            className="icon-btn"
            title={tr('Copy')}
            onClick={() => (void navigator.clipboard?.writeText(sel.text), setSel(null))}
          >
            <Copy size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Coloured highlight rectangles; click changes the colour or deletes. */
function MarksLayer({
  marks,
  interactive,
  onChange,
}: {
  marks: TextMark[];
  interactive: boolean;
  onChange: (m: TextMark[]) => void;
}): ReactNode {
  const [active, setActive] = useState<string | null>(null);
  return (
    <div className="marks-layer">
      {marks.map((m) =>
        m.rects.map(([x, y, w, h], i) => (
          <div
            key={`${m.id}-${i}`}
            className="text-mark"
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${w * 100}%`,
              height: `${h * 100}%`,
              background: m.c,
              pointerEvents: interactive ? 'auto' : 'none',
            }}
            onClick={() => setActive(active === m.id ? null : m.id)}
            title={m.text}
          />
        )),
      )}
      {active &&
        (() => {
          const m = marks.find((x) => x.id === active);
          if (!m) return null;
          const [x, y] = m.rects[0]!;
          return (
            <div
              className="selection-bar"
              style={{ left: `${x * 100}%`, top: `calc(${y * 100}% - 40px)` }}
            >
              {MARK_COLORS.map((c) => (
                <button
                  key={c}
                  className="mark-swatch"
                  style={{ background: c }}
                  aria-label={tr('Colour')}
                  onClick={() => (
                    onChange(marks.map((k) => (k.id === active ? { ...k, c } : k))),
                    setActive(null)
                  )}
                />
              ))}
              <button
                className="icon-btn"
                title={tr('Delete highlight')}
                onClick={() => (onChange(marks.filter((k) => k.id !== active)), setActive(null))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text boxes
// ---------------------------------------------------------------------------

/** Edit of the stored text boxes (current boxes → new boxes). */
type BoxesEdit = (boxes: TextBox[]) => TextBox[];

/** Removes empty boxes except `keep` (a box that is being typed into). */
function dropEmpty(boxes: TextBox[], keep: string | null = null): TextBox[] {
  return boxes.filter((b) => b.id === keep || b.text.trim());
}

/** Sticky-note text boxes on the slide. */
function TextBoxesLayer({
  boxes,
  tool,
  interactive,
  onChange,
}: {
  boxes: TextBox[];
  tool: SlideTool;
  interactive: boolean;
  /** Applies an edit; edits with the same `coalesceKey` form one undo step. */
  onChange: (edit: BoxesEdit, coalesceKey?: string) => void;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  /** Position/width while a box is dragged or resized (committed on release). */
  const [preview, setPreview] = useState<{ id: string; patch: Partial<TextBox> } | null>(null);
  const update = (id: string, patch: Partial<TextBox>, coalesceKey?: string): void =>
    onChange((all) => all.map((b) => (b.id === id ? { ...b, ...patch } : b)), coalesceKey);
  const width = ref.current?.clientWidth ?? 800;

  /** Ends editing: the typed text is already stored; empty boxes are removed. */
  const finishEditing = (): void => {
    setEditing(null);
    onChange((all) => dropEmpty(all));
  };

  // A click outside the selected box (anywhere, also outside the slide) deselects it.
  useEffect(() => {
    if (!selected) return;
    const down = (e: PointerEvent): void => {
      const target = e.target as Element | null;
      const box = target?.closest?.('.text-box');
      if (box && box.getAttribute('data-box') === selected) return;
      setSelected(null);
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !editing) setSelected(null);
    };
    // Capture phase: runs before the layer creates a new box and selects it.
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key);
    };
  }, [selected, editing]);

  /**
   * Drags a box edge or the whole box; the store is written once on release,
   * so one gesture is one undo step.
   */
  const drag = (
    e: ReactPointerEvent,
    id: string,
    patchAt: (dx: number, dy: number) => Partial<TextBox>,
  ): void => {
    const layer = ref.current!.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    let last: Partial<TextBox> | null = null;
    const move = (ev: PointerEvent): void => {
      last = patchAt((ev.clientX - sx) / layer.width, (ev.clientY - sy) / layer.height);
      setPreview({ id, patch: last });
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setPreview(null);
      if (last) update(id, last);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <div
      ref={ref}
      className={`boxes-layer${tool === 'text' ? ' placing' : ''}`}
      onPointerDown={(e) => {
        if (tool !== 'text' || e.target !== e.currentTarget) return;
        // Without this the browser moves the focus to the slide after the
        // click; the new (still empty) box would blur and delete itself.
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const box: TextBox = {
          id: newId(8),
          x: (e.clientX - r.left) / r.width,
          y: (e.clientY - r.top) / r.height,
          w: 0.3,
          s: 0.022,
          c: '#111111',
          bg: 'note',
          text: '',
        };
        // The box typed into so far keeps its text (stored while typing);
        // empty ones disappear.
        onChange((all) => [...dropEmpty(all), box]);
        setSelected(box.id);
        setEditing(box.id);
      }}
    >
      {boxes.map((stored) => {
        const b = preview?.id === stored.id ? { ...stored, ...preview.patch } : stored;
        return (
          <div
            key={b.id}
            data-box={b.id}
            className={`text-box bg-${b.bg}${selected === b.id ? ' selected' : ''}`}
            style={{
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: `${b.w * 100}%`,
              fontSize: b.s * width,
              color: b.c,
              pointerEvents: interactive ? 'auto' : 'none',
            }}
            onPointerDown={(e) => {
              if (editing === b.id) return;
              e.stopPropagation();
              setSelected(b.id);
              drag(e, b.id, (dx, dy) => ({
                x: Math.min(0.98, Math.max(0, stored.x + dx)),
                y: Math.min(0.98, Math.max(0, stored.y + dy)),
              }));
            }}
            onDoubleClick={() => setEditing(b.id)}
          >
            {editing === b.id ? (
              <textarea
                ref={(el) => {
                  // Focus once mounted, after the creating click has finished.
                  if (el && document.activeElement !== el) requestAnimationFrame(() => el.focus());
                }}
                className="text-box-input"
                defaultValue={b.text}
                // Stored on every keystroke (one undo step per typing burst),
                // so nothing is lost when the box closes without a blur.
                onChange={(e) => update(b.id, { text: e.target.value }, `box-text:${b.id}`)}
                onBlur={finishEditing}
                onKeyDown={(e) =>
                  e.key === 'Escape' && (e.currentTarget as HTMLTextAreaElement).blur()
                }
              />
            ) : (
              <span className="text-box-text">{b.text}</span>
            )}
            {selected === b.id && editing !== b.id && interactive && (
              <div className="box-bar" onPointerDown={(e) => e.stopPropagation()}>
                {['#111111', '#d0021b', '#1d4ed8', '#047857'].map((c) => (
                  <button
                    key={c}
                    className="mark-swatch"
                    style={{ background: c }}
                    aria-label={tr('Text colour')}
                    onClick={() => update(b.id, { c })}
                  />
                ))}
                <button
                  className="icon-btn"
                  title={tr('Smaller')}
                  onClick={() => update(b.id, { s: Math.max(0.008, b.s - 0.003) })}
                >
                  −
                </button>
                <button
                  className="icon-btn"
                  title={tr('Larger')}
                  onClick={() => update(b.id, { s: Math.min(0.08, b.s + 0.003) })}
                >
                  +
                </button>
                <button
                  className="icon-btn"
                  title={tr('Background')}
                  onClick={() =>
                    update(b.id, {
                      bg: b.bg === 'note' ? 'white' : b.bg === 'white' ? 'none' : 'note',
                    })
                  }
                >
                  <StickyNote size={14} />
                </button>
                <button
                  className="icon-btn"
                  title={tr('Delete')}
                  onClick={() => {
                    setSelected(null);
                    onChange((all) => all.filter((x) => x.id !== b.id));
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
            {selected === b.id && interactive && (
              <span
                className="box-resize"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  drag(e, b.id, (dx) => ({ w: Math.min(1, Math.max(0.04, stored.w + dx)) }));
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
