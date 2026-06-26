import { fileViewerStore } from '../store/fileViewerStore';

// ---------------------------------------------------------------------------
// Language detection from file extension
// ---------------------------------------------------------------------------

const EXTENSION_MAP: Record<string, string> = {
  // JavaScript / TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',

  // Web
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'less',
  '.vue': 'html',
  '.svelte': 'html',

  // Data / Config
  '.json': 'json',
  '.jsonc': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'ini',
  '.ini': 'ini',
  '.env': 'ini',
  '.xml': 'xml',
  '.svg': 'xml',

  // Markdown / Docs
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.txt': 'plaintext',
  '.log': 'plaintext',
  '.csv': 'plaintext',

  // Shell
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',
  '.bat': 'bat',
  '.cmd': 'bat',
  '.ps1': 'powershell',

  // Languages
  '.py': 'python',
  '.pyw': 'python',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.dart': 'dart',
  '.lua': 'lua',
  '.r': 'r',
  '.R': 'r',
  '.scala': 'scala',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.clj': 'clojure',
  '.cljs': 'clojure',
  '.ml': 'ocaml',
  '.mli': 'ocaml',
  '.zig': 'zig',
  '.nim': 'nim',
  '.v': 'verilog',
  '.sv': 'verilog',

  // SQL
  '.sql': 'sql',

  // Docker / CI
  '.dockerfile': 'dockerfile',

  // GraphQL
  '.graphql': 'graphql',
  '.gql': 'graphql',

  // Protobuf
  '.proto': 'protobuf',
};

// Filenames that map to a language regardless of extension
const FILENAME_MAP: Record<string, string> = {
  Dockerfile: 'dockerfile',
  Makefile: 'makefile',
  'CMakeLists.txt': 'cmake',
  '.gitignore': 'ini',
  '.gitattributes': 'ini',
  '.editorconfig': 'ini',
  Jenkinsfile: 'groovy',
};

export function detectLanguage(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  const filename = parts[parts.length - 1] || '';

  if (FILENAME_MAP[filename]) return FILENAME_MAP[filename];

  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex >= 0) {
    const ext = filename.slice(dotIndex).toLowerCase();
    if (EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
  }

  return 'plaintext';
}

// ---------------------------------------------------------------------------
// Concurrency guard — avoid duplicate fetches for the same path
// ---------------------------------------------------------------------------

const _pendingReads = new Set<string>();

// ---------------------------------------------------------------------------
// Public Actions (orchestration layer — store only holds pure data)
// ---------------------------------------------------------------------------

/**
 * Open a file — adds/activates the tab and fetches its content.
 *
 * If a host `fileOpenDelegate` is registered (e.g. `Platform.onOpenFile`),
 * opening is delegated entirely and no tab is created.
 *
 * For an already-open tab, merely activates it (no re-fetch) and updates the
 * reveal line. Content fetch is skipped when the tab is already loaded or
 * already in-flight.
 */
export function openFile(path: string, line?: number | null): void {
  const state = fileViewerStore.getState();

  // Delegate to host when configured (built-in viewer bypassed)
  if (state.fileOpenDelegate) {
    state.fileOpenDelegate(path, line);
    return;
  }

  if (line != null) {
    state.setRevealLine(line);
  }

  const existing = state.openFiles.find((f) => f.path === path);
  if (existing) {
    // Already open — just activate. Reuse cached content; no re-fetch.
    state.setActiveFilePath(path);
    return;
  }

  // New tab: create + activate + fetch
  const language = detectLanguage(path);
  state.addTab(path, language);
  state.setActiveFilePath(path);

  // Already in-flight (shouldn't happen for a brand-new tab, but guard anyway)
  if (_pendingReads.has(path)) return;

  const { fileContentReader } = fileViewerStore.getState();
  if (!fileContentReader) {
    fileViewerStore.getState().setFileError(path, 'File reading not configured');
    return;
  }

  _pendingReads.add(path);
  fileContentReader(path)
    .then((content) => {
      fileViewerStore.getState().setFileContent(path, content);
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      fileViewerStore.getState().setFileError(path, msg);
    })
    .finally(() => {
      _pendingReads.delete(path);
    });
}

/** Close a file tab. */
export function closeFile(path: string): void {
  fileViewerStore.getState().closeTab(path);
}

/** Switch the active tab. */
export function setActiveFile(path: string): void {
  fileViewerStore.getState().setActiveFilePath(path);
}

/** Clear the reveal line after it has been consumed by the editor. */
export function clearRevealLine(): void {
  fileViewerStore.getState().clearRevealLine();
}
