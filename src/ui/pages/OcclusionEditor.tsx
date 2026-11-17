/**
 * Image-occlusion editor: draw rectangles over an image; each rectangle
 * becomes a flashcard that hides it.
 */
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import type { Occlusion, RemId } from '@core/model/types';
import { newId } from '@core/util/ids';
import { useApp, useRem } from '../app/context';
import { Switch } from '../components/Controls';
import { Modal } from '../components/Modal';
import { useFileUrl } from '../editor/blocks';

/** The occlusion editor dialog. */
export function OcclusionEditor({
  remId,
  onClose,
}: {
  remId: RemId;
  onClose: () => void;
}): ReactNode {
  const app = useApp();
  const rem = useRem(remId);
  const url = useFileUrl(rem?.image?.src, rem?.image?.origin);
  const [masks, setMasks] = useState<Occlusion[]>(rem?.image?.occlusions ?? []);
  const [hideAll, setHideAll] = useState(rem?.image?.hideAllOcclusions ?? false);
  const [draft, setDraft] = useState<Occlusion | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  if (!rem?.image) return null;

  /** Relative pointer position inside the image. */
  const rel = (e: React.PointerEvent): { x: number; y: number } => {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const save = (): void => {
    app.rems.update(remId, {
      image: { ...rem.image!, occlusions: masks, hideAllOcclusions: hideAll || undefined },
    });
    onClose();
  };

  return (
    <Modal
      title="Image occlusion"
      wide
      onClose={onClose}
      footer={
        <>
          <span className="muted" style={{ marginRight: 'auto' }}>
            {masks.length} card{masks.length === 1 ? '' : 's'}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        Drag over the image to cover a region. Every region becomes one flashcard.
      </p>
      <div
        ref={boxRef}
        className="occlusion-canvas"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const p = rel(e);
          setDraft({ id: newId(8), x: p.x, y: p.y, w: 0, h: 0 });
        }}
        onPointerMove={(e) => {
          if (!draft) return;
          const p = rel(e);
          const startX = draft.w >= 0 ? draft.x : draft.x + draft.w;
          void startX;
          setDraft((d) => (d ? { ...d, w: p.x - d.x, h: p.y - d.y } : d));
        }}
        onPointerUp={() => {
          if (draft && Math.abs(draft.w) > 0.01 && Math.abs(draft.h) > 0.01) {
            const norm: Occlusion = {
              id: draft.id,
              x: Math.min(draft.x, draft.x + draft.w),
              y: Math.min(draft.y, draft.y + draft.h),
              w: Math.abs(draft.w),
              h: Math.abs(draft.h),
            };
            setMasks((m) => [...m, norm]);
          }
          setDraft(null);
        }}
      >
        {url && <img src={url} alt="" draggable={false} />}
        {[
          ...masks,
          ...(draft
            ? [
                {
                  ...draft,
                  x: Math.min(draft.x, draft.x + draft.w),
                  y: Math.min(draft.y, draft.y + draft.h),
                  w: Math.abs(draft.w),
                  h: Math.abs(draft.h),
                },
              ]
            : []),
        ].map((m, i) => (
          <div
            key={m.id}
            className="occlusion"
            style={{
              left: `${m.x * 100}%`,
              top: `${m.y * 100}%`,
              width: `${m.w * 100}%`,
              height: `${m.h * 100}%`,
            }}
          >
            <span>{m.label || i + 1}</span>
          </div>
        ))}
      </div>
      <Switch
        checked={hideAll}
        onChange={setHideAll}
        label="Hide all regions while asking (otherwise only the asked one)"
      />
      {masks.map((m, i) => (
        <div key={m.id} className="row">
          <span className="badge">{i + 1}</span>
          <input
            className="input"
            placeholder="Label / expected answer (optional)"
            value={m.label ?? ''}
            onChange={(e) =>
              setMasks((all) =>
                all.map((x) => (x.id === m.id ? { ...x, label: e.target.value } : x)),
              )
            }
          />
          <button
            className="icon-btn"
            aria-label="Delete region"
            onClick={() => setMasks((all) => all.filter((x) => x.id !== m.id))}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </Modal>
  );
}
