/**
 * Records audio with the microphone and attaches it to a Rem.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Mic, Square } from 'lucide-react';
import type { RemId } from '@core/model/types';
import { useApp } from '../app/context';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { t as tr } from '@core/i18n';

/** The recorder dialog. */
export function AudioRecorder({
  remId,
  onClose,
}: {
  remId: RemId;
  onClose: () => void;
}): ReactNode {
  const app = useApp();
  const toast = useToast();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  const start = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        const src = await app.files.save(blob, 'recording.webm');
        app.rems.update(remId, { embed: { url: src } });
        toast(tr('Recording attached'));
        onClose();
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch (err) {
      toast(
        tr('Microphone not available: {0}', {
          '0': err instanceof Error ? err.message : String(err),
        }),
        'error',
      );
    }
  };

  return (
    <Modal title={tr('Record audio')} onClose={onClose}>
      <div className="col" style={{ alignItems: 'center', padding: 20 }}>
        <div className="mono" style={{ fontSize: 32 }}>
          {String(Math.floor(seconds / 60)).padStart(2, '0')}:
          {String(seconds % 60).padStart(2, '0')}
        </div>
        {recording ? (
          <button className="btn btn-danger btn-lg" onClick={() => recorder.current?.stop()}>
            <Square size={16} /> {tr('Stop & attach')}
          </button>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={() => void start()}>
            <Mic size={16} /> {tr('Start recording')}
          </button>
        )}
      </div>
    </Modal>
  );
}
