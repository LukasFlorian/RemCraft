/**
 * Renders a slide with its annotations (highlights, pen and marker strokes,
 * text boxes) into a single image. Used by the handout, so printing does not
 * depend on how each browser lays out the stacked interactive layers of the
 * slide widget: every slide is one plain `<img>`.
 */
import type { SlideAnnotations } from '@core/model/types';

/** Loads an image. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Folie konnte nicht geladen werden'));
    img.src = src;
  });
}

/** Wraps text into lines that fit `maxWidth` (respects explicit line breaks). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Composites a slide image and its annotations.
 *
 * @param src Rendered slide (object URL or data URL).
 * @param ann Annotations of the slide (coordinates relative to the slide).
 * @returns A PNG data URL of the same size as the slide image.
 */
export async function annotatedSlideImage(
  src: string,
  ann: SlideAnnotations | undefined,
): Promise<string> {
  const img = await loadImage(src);
  if (!ann || ann.strokes.length + ann.boxes.length + ann.marks.length === 0) return src;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  // Highlights below the ink, multiplied like on screen.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.4;
  for (const m of ann.marks) {
    ctx.fillStyle = m.c;
    for (const [x, y, rw, rh] of m.rects) ctx.fillRect(x * w, y * h, rw * w, rh * h);
  }
  ctx.restore();

  for (const s of ann.strokes) {
    if (s.p.length < 2) continue;
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = s.tool === 'marker' ? 0.35 : 1;
    ctx.lineWidth = s.width * w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < s.p.length; i += 2) {
      const x = s.p[i]! * w;
      const y = s.p[i + 1]! * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    if (s.p.length === 2) ctx.lineTo(s.p[0]! * w + 0.1, s.p[1]! * h);
    ctx.stroke();
    ctx.restore();
  }

  for (const b of ann.boxes) {
    const size = b.s * w;
    const pad = size * 0.4;
    const boxW = b.w * w;
    ctx.font = `${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const lines = wrap(ctx, b.text, boxW - 2 * pad);
    const lineH = size * 1.3;
    const boxH = lines.length * lineH + 2 * pad;
    const x = b.x * w;
    const y = b.y * h;
    if (b.bg !== 'none') {
      ctx.save();
      ctx.fillStyle = b.bg === 'note' ? '#fff8c4' : '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = size * 0.3;
      ctx.shadowOffsetY = size * 0.08;
      ctx.fillRect(x, y, boxW, boxH);
      ctx.restore();
    }
    ctx.fillStyle = b.c;
    ctx.textBaseline = 'top';
    lines.forEach((line, i) =>
      ctx.fillText(line, x + pad, y + pad + i * lineH + (lineH - size) / 2),
    );
  }
  return canvas.toDataURL('image/png');
}
