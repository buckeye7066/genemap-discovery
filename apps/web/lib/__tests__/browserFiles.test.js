import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText, downloadBlob } from '../browserFiles';

afterEach(() => {
  vi.useRealTimers();
});

describe('browser file compatibility', () => {
  it('defers object-URL revocation until WebKit can consume the click', () => {
    vi.useFakeTimers();
    const anchor = { click: vi.fn(), remove: vi.fn() };
    const urlApi = {
      createObjectURL: vi.fn(() => 'blob:genemap-export'),
      revokeObjectURL: vi.fn(),
    };
    const documentObject = {
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => anchor),
    };

    downloadBlob(new Blob(['genes']), 'genes.json', { documentObject, urlApi });
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(urlApi.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:genemap-export');
  });

  it('uses the modern Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyText('RUNX1', {
      navigatorObject: { clipboard: { writeText } },
      documentObject: null,
    })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('RUNX1');
  });

  it('falls back to selection copy when Safari rejects Clipboard API access', async () => {
    const textarea = {
      style: {},
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
      remove: vi.fn(),
    };
    const previousFocus = { focus: vi.fn() };
    const documentObject = {
      activeElement: previousFocus,
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => textarea),
      execCommand: vi.fn(() => true),
    };

    await expect(copyText('CFTR', {
      navigatorObject: { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } },
      documentObject,
    })).resolves.toBe(true);

    expect(textarea.value).toBe('CFTR');
    expect(textarea.select).toHaveBeenCalledOnce();
    expect(documentObject.execCommand).toHaveBeenCalledWith('copy');
    expect(textarea.remove).toHaveBeenCalledOnce();
    expect(previousFocus.focus).toHaveBeenCalledOnce();
  });
});
