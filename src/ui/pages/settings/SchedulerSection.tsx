/**
 * Scheduler configuration: the global default plus custom schedulers that
 * can be assigned to documents/folders (via their ⋯ menu).
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_SCHEDULER_ID,
  DEFAULT_SM2_PARAMS,
} from '@core/model/factories';
import type { FsrsParams, SchedulerConfig, Sm2Params } from '@core/model/types';
import { selectSchedulers, selectSettings } from '@data/selectors';
import { useApp, useSelector } from '../../app/context';
import { useDialogs } from '../../components/Confirm';
import { Field, Switch } from '../../components/Controls';

/** Parses "1, 10" into minutes. */
const parseSteps = (s: string): number[] =>
  s
    .split(/[,\s]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

/** The scheduler settings. */
export function SchedulerSection(): ReactNode {
  const app = useApp();
  const schedulers = useSelector(selectSchedulers);
  const settings = useSelector(selectSettings);
  const usage = useSelector((s) =>
    s.memo('schedUsage', [s.collectionVersion('rems')], () => {
      const m = new Map<string, number>();
      for (const r of s.all('rems'))
        if (r.schedulerId) m.set(r.schedulerId, (m.get(r.schedulerId) ?? 0) + 1);
      return m;
    }),
  );
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card col" style={{ gap: 12 }}>
        <h2 className="card-title">Schedulers</h2>
        <p className="muted" style={{ margin: 0 }}>
          The global default applies to all cards. Custom schedulers can be assigned to a document
          or folder (⋯ menu → Scheduler); the closest assignment wins. RemNote recommends changing
          schedulers only once you have used the app for a while.
        </p>
        <Field label="Global default scheduler">
          <select
            className="select"
            value={settings.defaultSchedulerId}
            onChange={(e) => app.settings.update({ defaultSchedulerId: e.target.value })}
          >
            {schedulers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="row">
          <button
            className="btn"
            onClick={() => app.settings.createScheduler({ name: 'Custom SM-2', algorithm: 'sm2' })}
          >
            <Plus size={15} /> New SM-2 scheduler
          </button>
          <button
            className="btn"
            onClick={() => app.settings.createScheduler({ name: 'FSRS', algorithm: 'fsrs' })}
          >
            <Plus size={15} /> New FSRS scheduler
          </button>
        </div>
      </div>
      {schedulers.map((s) => (
        <SchedulerCard key={s.id} config={s} usedBy={usage.get(s.id) ?? 0} />
      ))}
    </div>
  );
}

/** Editor for one scheduler. */
function SchedulerCard({ config, usedBy }: { config: SchedulerConfig; usedBy: number }): ReactNode {
  const app = useApp();
  const dialogs = useDialogs();
  const [weights, setWeights] = useState(config.fsrs.weights.join(', '));
  const save = (patch: Partial<SchedulerConfig>): void =>
    app.settings.saveScheduler({ ...config, ...patch });
  const sm2 = (patch: Partial<Sm2Params>): void => save({ sm2: { ...config.sm2, ...patch } });
  const fsrs = (patch: Partial<FsrsParams>): void => save({ fsrs: { ...config.fsrs, ...patch } });
  const isDefault = config.id === DEFAULT_SCHEDULER_ID;
  const num = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    step = 0.01,
    hint?: string,
  ): ReactNode => (
    <Field label={label} hint={hint}>
      <input
        className="input"
        type="number"
        step={step}
        defaultValue={value}
        onBlur={(e) => Number.isFinite(Number(e.target.value)) && onChange(Number(e.target.value))}
      />
    </Field>
  );
  return (
    <div className="card col" style={{ gap: 14 }}>
      <div className="row">
        <input
          className="input"
          style={{ maxWidth: 320, fontWeight: 600 }}
          defaultValue={config.name}
          onBlur={(e) => save({ name: e.target.value || config.name })}
          aria-label="Scheduler name"
        />
        <select
          className="select"
          style={{ width: 160 }}
          value={config.algorithm}
          onChange={(e) => save({ algorithm: e.target.value as 'sm2' | 'fsrs' })}
          aria-label="Algorithm"
        >
          <option value="sm2">Anki SM-2</option>
          <option value="fsrs">FSRS-6</option>
        </select>
        <span className="spacer" />
        {usedBy > 0 && <span className="badge">used by {usedBy}</span>}
        {!isDefault && (
          <button
            className="icon-btn"
            aria-label="Delete scheduler"
            onClick={async () => {
              if (
                await dialogs.confirm({
                  title: `Delete “${config.name}”?`,
                  message: 'Assigned documents fall back to the default scheduler.',
                  confirmLabel: 'Delete',
                  danger: true,
                })
              )
                app.settings.deleteScheduler(config.id);
            }}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {config.algorithm === 'sm2' ? (
        <div className="grid-3" key={`sm2-${config.updatedAt}`}>
          <Field label="Learning steps (minutes)" hint="e.g. 1, 10">
            <input
              className="input"
              defaultValue={config.sm2.learningSteps.join(', ')}
              onBlur={(e) => sm2({ learningSteps: parseSteps(e.target.value) })}
            />
          </Field>
          <Field label="Relearning steps (minutes)">
            <input
              className="input"
              defaultValue={config.sm2.relearningSteps.join(', ')}
              onBlur={(e) => sm2({ relearningSteps: parseSteps(e.target.value) })}
            />
          </Field>
          {num(
            'Graduating interval (days)',
            config.sm2.graduatingInterval,
            (v) => sm2({ graduatingInterval: v }),
            1,
          )}
          {num('Easy interval (days)', config.sm2.easyInterval, (v) => sm2({ easyInterval: v }), 1)}
          {num(
            'Starting ease',
            config.sm2.startingEase,
            (v) => sm2({ startingEase: v }),
            0.05,
            '2.3 = 230 %',
          )}
          {num('Minimum ease', config.sm2.minimumEase, (v) => sm2({ minimumEase: v }), 0.05)}
          {num('Easy bonus', config.sm2.easyBonus, (v) => sm2({ easyBonus: v }), 0.05)}
          {num(
            'Hard interval factor',
            config.sm2.hardInterval,
            (v) => sm2({ hardInterval: v }),
            0.05,
          )}
          {num(
            'Interval modifier',
            config.sm2.intervalModifier,
            (v) => sm2({ intervalModifier: v }),
            0.05,
          )}
          {num(
            'Lapse multiplier',
            config.sm2.lapseMultiplier,
            (v) => sm2({ lapseMultiplier: v }),
            0.05,
            'New interval after forgetting',
          )}
          {num(
            'Minimum interval after lapse (days)',
            config.sm2.minimumLapseInterval,
            (v) => sm2({ minimumLapseInterval: v }),
            1,
          )}
          {num(
            'Maximum interval (days)',
            config.sm2.maximumInterval,
            (v) => sm2({ maximumInterval: v }),
            1,
          )}
          <Switch
            checked={config.sm2.fuzz}
            onChange={(v) => sm2({ fuzz: v })}
            label="Interval fuzz"
          />
          <button className="btn btn-sm" onClick={() => save({ sm2: { ...DEFAULT_SM2_PARAMS } })}>
            Reset to defaults
          </button>
        </div>
      ) : (
        <div className="col" key={`fsrs-${config.updatedAt}`}>
          <Field
            label={`Desired retention: ${Math.round(config.fsrs.desiredRetention * 100)} %`}
            hint="Higher retention means more reviews. 90 % is a good default."
          >
            <input
              type="range"
              min={0.7}
              max={0.99}
              step={0.01}
              value={config.fsrs.desiredRetention}
              onChange={(e) => fsrs({ desiredRetention: Number(e.target.value) })}
            />
          </Field>
          <div className="grid-3">
            <Field label="Learning steps (minutes)">
              <input
                className="input"
                defaultValue={config.fsrs.learningSteps.join(', ')}
                onBlur={(e) => fsrs({ learningSteps: parseSteps(e.target.value) })}
              />
            </Field>
            <Field label="Relearning steps (minutes)">
              <input
                className="input"
                defaultValue={config.fsrs.relearningSteps.join(', ')}
                onBlur={(e) => fsrs({ relearningSteps: parseSteps(e.target.value) })}
              />
            </Field>
            {num(
              'Maximum interval (days)',
              config.fsrs.maximumInterval,
              (v) => fsrs({ maximumInterval: v }),
              1,
            )}
          </div>
          <Field
            label="Model weights (21 values, FSRS-6)"
            hint="Paste optimised weights from the FSRS optimizer or keep the defaults."
          >
            <textarea
              className="textarea mono"
              rows={3}
              value={weights}
              onChange={(e) => setWeights(e.target.value)}
              onBlur={() => {
                const w = weights
                  .split(/[,\s]+/)
                  .map(Number)
                  .filter((n) => Number.isFinite(n));
                if (w.length === 19 || w.length === 21) fsrs({ weights: w });
                else setWeights(config.fsrs.weights.join(', '));
              }}
            />
          </Field>
          <div className="row">
            <Switch
              checked={config.fsrs.fuzz}
              onChange={(v) => fsrs({ fuzz: v })}
              label="Interval fuzz"
            />
            <button
              className="btn btn-sm"
              onClick={() => {
                setWeights(DEFAULT_FSRS_WEIGHTS.join(', '));
                fsrs({ weights: [...DEFAULT_FSRS_WEIGHTS] });
              }}
            >
              Reset weights
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
