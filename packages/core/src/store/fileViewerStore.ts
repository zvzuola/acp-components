import { createStore } from 'zustand/vanilla';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Reader injected from `Platform.readFileContent` (host native capability). */
export type FileContentReader = (path: string) => Promise<string>;

/**
 * Optional host delegate. When set (e.g. `Platform.onOpenFile`), the built-in
 * FileViewer is bypassed — `openFile` forwards to this instead of opening a tab.
 */
export type FileOpenDelegate = (path: string, line?: number | null) => void;

export interface OpenFileEntry {
  /** Absolute file path */
  path: string;
  /** File content (empty while loading) */
  content: string;
  /** Detected language for syntax highlighting */
  language: string;
  /** Whether content is currently being fetched */
  loading: boolean;
  /** Error message if content fetch failed */
  error: string | null;
}

/**
 * Pure data + atomic setters for the file viewer. Business orchestration
 * (host delegation, async content fetch, concurrency guard) lives in
 * `actions/fileViewer.ts` — NOT here. Mirrors the fileTreeStore split
 * (store = data box, actions = orchestration).
 */
export interface FileViewerState {
  /** List of open file tabs */
  openFiles: OpenFileEntry[];
  /** Currently active (visible) file path, or `null` */
  activeFilePath: string | null;
  /** Line number to reveal in the editor (consumed after use) */
  revealLine: number | null;
  /** Injected content reader (`Platform.readFileContent`). Required to fetch content. */
  fileContentReader: FileContentReader | null;
  /** Injected host delegate (`Platform.onOpenFile`). When set, opening is delegated to the host. */
  fileOpenDelegate: FileOpenDelegate | null;

  /** Register the content reader (called automatically by the platform driver). */
  setFileContentReader: (reader: FileContentReader | null) => void;
  /** Register the host open delegate (called automatically by the platform driver). */
  setFileOpenDelegate: (delegate: FileOpenDelegate | null) => void;

  /** Add a new tab in loading state, or refresh an existing one to loading. Does NOT fetch content. */
  addTab: (path: string, language: string) => void;
  /** Activate a tab by path. The tab must already exist (add via `addTab` first). */
  setActiveFilePath: (path: string) => void;
  /** Remove a tab; if it was active, switches active to the adjacent tab. */
  closeTab: (path: string) => void;
  /** Set the line to reveal (consumed by the editor via `clearRevealLine`). */
  setRevealLine: (line: number | null) => void;
  /** Clear the reveal line after it has been consumed. */
  clearRevealLine: () => void;
  /** Populate a tab's content after a successful fetch (clears loading/error). */
  setFileContent: (path: string, content: string) => void;
  /** Mark a tab's content fetch as failed. */
  setFileError: (path: string, error: string) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const fileViewerStore = createStore<FileViewerState>((set) => ({
  openFiles: [],
  activeFilePath: null,
  revealLine: null,
  fileContentReader: null,
  fileOpenDelegate: null,

  setFileContentReader: (reader) =>
    set((state) =>
      state.fileContentReader === reader
        ? state
        : { fileContentReader: reader },
    ),

  setFileOpenDelegate: (delegate) =>
    set((state) =>
      state.fileOpenDelegate === delegate
        ? state
        : { fileOpenDelegate: delegate },
    ),

  addTab: (path, language) => {
    set((state) => {
      const existing = state.openFiles.find((f) => f.path === path);
      if (existing) {
        // Refresh language / reset to loading
        return {
          openFiles: state.openFiles.map((f) =>
            f.path === path
              ? { ...f, language, loading: true, error: null }
              : f,
          ),
        };
      }
      const entry: OpenFileEntry = {
        path,
        content: '',
        language,
        loading: true,
        error: null,
      };
      return { openFiles: [...state.openFiles, entry] };
    });
  },

  setActiveFilePath: (path) =>
    set((state) =>
      state.activeFilePath === path ? state : { activeFilePath: path },
    ),

  closeTab: (path) => {
    set((state) => {
      const idx = state.openFiles.findIndex((f) => f.path === path);
      if (idx === -1) return state;

      const next = state.openFiles.filter((f) => f.path !== path);

      // If closing the active tab, switch to adjacent
      let activeFilePath = state.activeFilePath;
      if (activeFilePath === path) {
        if (next.length === 0) {
          activeFilePath = null;
        } else {
          // Prefer the tab to the right, fall back to left
          const newIdx = Math.min(idx, next.length - 1);
          activeFilePath = next[newIdx].path;
        }
      }

      return { openFiles: next, activeFilePath };
    });
  },

  setRevealLine: (line) => set({ revealLine: line }),

  clearRevealLine: () =>
    set((state) => (state.revealLine === null ? state : { revealLine: null })),

  setFileContent: (path, content) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, content, loading: false, error: null } : f,
      ),
    }));
  },

  setFileError: (path, error) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, error, loading: false } : f,
      ),
    }));
  },
}));
