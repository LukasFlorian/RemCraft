/**
 * Dialog to choose the icon and colour of a folder or document: a curated
 * icon set, any emoji, nine colours, and "default" to reset.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { RemId } from '@core/model/types';
import { useApp, useRem } from '../app/context';
import { Modal } from './Modal';
import { REM_COLORS, REM_ICONS, RemIcon, isEmojiIcon } from './RemIcon';
import { t } from '@core/i18n';

/** The icon & colour dialog. */
export function IconPicker({ remId, onClose }: { remId: RemId; onClose: () => void }): ReactNode {
  const app = useApp();
  const rem = useRem(remId);
  const [emoji, setEmoji] = useState(rem?.icon && isEmojiIcon(rem.icon) ? rem.icon : '');
  if (!rem) return null;
  const set = (patch: { icon?: string | undefined; color?: string | undefined }): void =>
    app.rems.update(remId, patch);

  return (
    <Modal title={t('Icon and colour')} onClose={onClose}>
      <div className="row" style={{ gap: 12 }}>
        <span className="icon-preview">
          <RemIcon rem={rem} size={34} />
        </span>
        <span className="muted">{t('Preview')}</span>
        <span className="spacer" />
        <button
          className="btn btn-sm"
          onClick={() => (set({ icon: undefined, color: undefined }), setEmoji(''))}
        >
          {t('Default')}
        </button>
      </div>
      <div className="icon-grid" role="listbox" aria-label={t('Icon')}>
        {Object.entries(REM_ICONS).map(([name, Icon]) => (
          <button
            key={name}
            role="option"
            aria-selected={rem.icon === name}
            title={name}
            className={`icon-choice${rem.icon === name ? ' active' : ''}`}
            onClick={() => set({ icon: name })}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
      <div className="row">
        <input
          className="input"
          style={{ width: 120 }}
          placeholder={t('Emoji 📚')}
          value={emoji}
          maxLength={8}
          onChange={(e) => {
            setEmoji(e.target.value);
            const v = e.target.value.trim();
            if (v) set({ icon: v });
          }}
        />
        <span className="faint" style={{ fontSize: 12 }}>
          {t('or enter an emoji')}
        </span>
      </div>
      <div className="row" role="listbox" aria-label={t('Colour')} style={{ gap: 8 }}>
        {Object.entries(REM_COLORS).map(([key, color]) => (
          <button
            key={key}
            role="option"
            aria-selected={rem.color === key}
            aria-label={key}
            title={key}
            className={`color-choice${rem.color === key ? ' active' : ''}`}
            style={{ background: color }}
            onClick={() => set({ color: key })}
          />
        ))}
      </div>
    </Modal>
  );
}
