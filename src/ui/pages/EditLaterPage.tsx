/**
 * "Edit Later": every Rem flagged for later editing.
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Check } from 'lucide-react';
import { useApp, useSelector } from '../app/context';
import { RemContent } from '../editor/RemBlock';
import { useRemTitle } from '../hooks/useRemTitle';

/** Lists Rems marked "edit later". */
export function EditLaterPage(): ReactNode {
  const app = useApp();
  const navigate = useNavigate();
  const rems = useSelector((s) =>
    s.memo('editLater', [s.collectionVersion('rems')], () =>
      s
        .all('rems')
        .filter((r) => r.editLater)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    ),
  );
  return (
    <div className="main-scroll">
      <div className="page">
        <div className="page-header">
          <h1>Edit Later</h1>
        </div>
        {rems.length === 0 && (
          <div className="empty">
            Nothing to edit later. Use “/Edit later” on any Rem to collect it here.
          </div>
        )}
        {rems.map((r) => (
          <div
            key={r.id}
            className="reference-item row"
            onClick={() => navigate(`/rem/${r.parentId ?? r.id}`)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <ParentTitle id={r.parentId} />
              <RemContent rem={r} />
            </div>
            <button
              className="btn btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                app.rems.update(r.id, { editLater: undefined });
              }}
            >
              <Check size={14} /> Done
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ParentTitle({ id }: { id: string | null }): ReactNode {
  const title = useRemTitle(id, '');
  return title ? (
    <div className="faint" style={{ fontSize: 12 }}>
      {title}
    </div>
  ) : null;
}
