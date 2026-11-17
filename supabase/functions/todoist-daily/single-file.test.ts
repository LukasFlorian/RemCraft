/**
 * The dashboard copy (`single-file.ts`) must match its sources; regenerate
 * with `node scripts/build-function-single-file.mjs` when this fails.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error - plain JavaScript build script without type declarations
import { buildSingleFile } from '../../../scripts/build-function-single-file.mjs';

const dir = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(dir, p), 'utf8');

describe('todoist-daily single-file copy', () => {
  it('is up to date with _shared/todoist.ts and index.ts', () => {
    const expected = buildSingleFile(read('_shared/todoist.ts'), read('todoist-daily/index.ts'));
    expect(read('todoist-daily/single-file.ts')).toBe(expected);
  });

  it('has no imports of the shared folder', () => {
    expect(read('todoist-daily/single-file.ts')).not.toMatch(/from '\.\.\/_shared\//);
  });
});
