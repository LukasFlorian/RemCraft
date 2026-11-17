import { afterEach, describe, expect, it, vi } from 'vitest';
import * as picker from '../hooks/useFilePicker';
import { downloadSkill, isZip } from './skillDownload';

describe('skill download', () => {
  afterEach(() => vi.restoreAllMocks());

  it('recognises ZIP signatures', () => {
    expect(isZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]))).toBe(true);
    expect(isZip(new TextEncoder().encode('<!doctype html>'))).toBe(false);
  });

  it('refuses an HTML fallback instead of saving it as .zip', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<!doctype html><html></html>'));
    const save = vi.spyOn(picker, 'downloadBlob').mockImplementation(() => {});
    await expect(downloadSkill()).rejects.toThrow(/kein ZIP/);
    expect(save).not.toHaveBeenCalled();
  });

  it('saves a valid archive', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2])),
    );
    const save = vi.spyOn(picker, 'downloadBlob').mockImplementation(() => {});
    await downloadSkill();
    expect(save).toHaveBeenCalledWith('remcraft-flashcards.zip', expect.any(Blob));
  });
});
