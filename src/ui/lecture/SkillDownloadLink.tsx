/**
 * Link that downloads the Claude skill via {@link downloadSkill} (checked
 * archive instead of a plain link, see `skillDownload.ts`).
 */
import type { ReactNode } from 'react';
import { useToast } from '../components/Toast';
import { downloadSkill, SKILL_URL } from './skillDownload';

/** Download link of the skill; failures are shown as a toast. */
export function SkillDownloadLink({
  className,
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: ReactNode;
}): ReactNode {
  const toast = useToast();
  return (
    <a
      className={className}
      href={SKILL_URL}
      title={title}
      onClick={(e) => {
        // Fetch and verify instead of letting the browser navigate to the file.
        e.preventDefault();
        downloadSkill().catch((err: unknown) =>
          toast(err instanceof Error ? err.message : String(err), 'error'),
        );
      }}
    >
      {children}
    </a>
  );
}
