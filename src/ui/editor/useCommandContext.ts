/**
 * Builds the {@link CommandContext} for a Rem from the app-level providers.
 */
import { useNavigate } from 'react-router';
import type { RemId } from '@core/model/types';
import { useApp } from '../app/context';
import { useModals } from '../app/modals';
import { useDialogs } from '../components/Confirm';
import { useToast } from '../components/Toast';
import { pickFiles } from '../hooks/useFilePicker';
import type { CommandContext } from './commands';
import { useController } from './controller';

/** Returns a factory for command contexts. */
export function useCommandContextFactory(): (remId: RemId, instance: string) => CommandContext {
  const app = useApp();
  const controller = useController();
  const navigate = useNavigate();
  const dialogs = useDialogs();
  const toast = useToast();
  const modals = useModals();
  return (remId, instance) => ({
    app,
    controller,
    instance,
    remId,
    view: controller.activeView?.remId === remId ? controller.activeView.view : null,
    navigate: (path) => navigate(path),
    prompt: (title, initial) => dialogs.prompt({ title, ...(initial !== undefined ? { initial } : {}) }),
    pickFile: async (accept) => (await pickFiles(accept))[0] ?? null,
    toast: (m) => toast(m),
    openOcclusion: (id) => modals.open({ kind: 'occlusion', remId: id }),
    openRecorder: (id) => modals.open({ kind: 'recorder', remId: id }),
  });
}
