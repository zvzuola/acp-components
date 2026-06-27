import { describe, it, expect, beforeEach } from 'vitest';
import { fileViewerStore } from './fileViewerStore';
import type { FileContentReader, FileOpenDelegate } from './fileViewerStore';

function resetStore(): void {
  fileViewerStore.setState({
    openFiles: [],
    activeFilePath: null,
    revealLine: null,
    fileContentReader: null,
    fileOpenDelegate: null,
  });
}

beforeEach(() => {
  resetStore();
});

describe('fileViewerStore — tabs', () => {
  it('addTab creates a loading tab', () => {
    fileViewerStore.getState().addTab('/a.ts', 'typescript');
    const f = fileViewerStore.getState().openFiles[0];
    expect(f.path).toBe('/a.ts');
    expect(f.language).toBe('typescript');
    expect(f.loading).toBe(true);
    expect(f.content).toBe('');
    expect(f.error).toBeNull();
  });

  it('addTab on an existing path resets to loading and updates language (no duplicate)', () => {
    fileViewerStore.getState().addTab('/a.ts', 'typescript');
    fileViewerStore.getState().setFileContent('/a.ts', 'content');
    fileViewerStore.getState().addTab('/a.ts', 'plaintext');
    const files = fileViewerStore.getState().openFiles;
    expect(files).toHaveLength(1);
    expect(files[0].language).toBe('plaintext');
    expect(files[0].loading).toBe(true);
    expect(files[0].content).toBe('content'); // content is not wiped, just re-flagged loading
    expect(files[0].error).toBeNull();
  });

  it('setActiveFilePath is idempotent for the same path', () => {
    fileViewerStore.getState().addTab('/a.ts', 'typescript');
    fileViewerStore.getState().setActiveFilePath('/a.ts');
    const before = fileViewerStore.getState();
    fileViewerStore.getState().setActiveFilePath('/a.ts');
    expect(fileViewerStore.getState()).toBe(before);
  });
});

describe('fileViewerStore — closeTab active-switching', () => {
  function openTabs(paths: string[]): void {
    for (const p of paths) fileViewerStore.getState().addTab(p, 'plaintext');
  }

  it('closing a non-active tab only removes it', () => {
    openTabs(['/a', '/b', '/c']);
    fileViewerStore.getState().setActiveFilePath('/c');
    fileViewerStore.getState().closeTab('/a');
    expect(fileViewerStore.getState().openFiles.map((f) => f.path)).toEqual(['/b', '/c']);
    expect(fileViewerStore.getState().activeFilePath).toBe('/c');
  });

  it('closing the active tab switches to the adjacent tab (prefer right, fall back left)', () => {
    openTabs(['/a', '/b', '/c']);
    fileViewerStore.getState().setActiveFilePath('/b'); // middle
    fileViewerStore.getState().closeTab('/b');
    // After removing /b, the tab to its right (/c) takes its index → preferred.
    expect(fileViewerStore.getState().activeFilePath).toBe('/c');
  });

  it('closing the last tab clears activeFilePath', () => {
    openTabs(['/a']);
    fileViewerStore.getState().setActiveFilePath('/a');
    fileViewerStore.getState().closeTab('/a');
    expect(fileViewerStore.getState().openFiles).toEqual([]);
    expect(fileViewerStore.getState().activeFilePath).toBeNull();
  });

  it('closing the active tail tab falls back to the left neighbor', () => {
    openTabs(['/a', '/b']);
    fileViewerStore.getState().setActiveFilePath('/b'); // tail
    fileViewerStore.getState().closeTab('/b');
    expect(fileViewerStore.getState().activeFilePath).toBe('/a');
  });

  it('closeTab on an unknown path is a no-op', () => {
    openTabs(['/a']);
    const before = fileViewerStore.getState();
    fileViewerStore.getState().closeTab('/nope');
    expect(fileViewerStore.getState()).toBe(before);
  });
});

describe('fileViewerStore — content / error / revealLine', () => {
  it('setFileContent clears loading and error', () => {
    fileViewerStore.getState().addTab('/a.ts', 'typescript');
    fileViewerStore.getState().setFileError('/a.ts', 'boom');
    fileViewerStore.getState().setFileContent('/a.ts', 'hello');
    const f = fileViewerStore.getState().openFiles[0];
    expect(f.content).toBe('hello');
    expect(f.loading).toBe(false);
    expect(f.error).toBeNull();
  });

  it('setFileError clears loading and sets the message', () => {
    fileViewerStore.getState().addTab('/a.ts', 'typescript');
    fileViewerStore.getState().setFileError('/a.ts', 'cannot read');
    const f = fileViewerStore.getState().openFiles[0];
    expect(f.loading).toBe(false);
    expect(f.error).toBe('cannot read');
  });

  it('setRevealLine / clearRevealLine round-trip (clear is idempotent)', () => {
    fileViewerStore.getState().setRevealLine(42);
    expect(fileViewerStore.getState().revealLine).toBe(42);
    fileViewerStore.getState().clearRevealLine();
    expect(fileViewerStore.getState().revealLine).toBeNull();
    // Clearing again is a no-op (same state → same reference).
    const before = fileViewerStore.getState();
    fileViewerStore.getState().clearRevealLine();
    expect(fileViewerStore.getState()).toBe(before);
  });
});

describe('fileViewerStore — injected readers / delegates', () => {
  it('setFileContentReader / setFileOpenDelegate set values and are no-op for same reference', () => {
    const reader: FileContentReader = async () => '';
    const delegate: FileOpenDelegate = () => {};
    fileViewerStore.getState().setFileContentReader(reader);
    fileViewerStore.getState().setFileOpenDelegate(delegate);
    expect(fileViewerStore.getState().fileContentReader).toBe(reader);
    expect(fileViewerStore.getState().fileOpenDelegate).toBe(delegate);

    // Re-setting the same reference must not produce a new state object.
    const before = fileViewerStore.getState();
    fileViewerStore.getState().setFileContentReader(reader);
    fileViewerStore.getState().setFileOpenDelegate(delegate);
    expect(fileViewerStore.getState()).toBe(before);
  });
});
