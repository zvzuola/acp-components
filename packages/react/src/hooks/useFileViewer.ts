import { useState, useCallback, useRef } from 'react';
import { usePlatform } from '../context/PlatformContext';

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
  'Dockerfile': 'dockerfile',
  'Makefile': 'makefile',
  'CMakeLists.txt': 'cmake',
  '.gitignore': 'ini',
  '.gitattributes': 'ini',
  '.editorconfig': 'ini',
  'Jenkinsfile': 'groovy',
};

function detectLanguage(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  const filename = parts[parts.length - 1] || '';

  // Check exact filename match
  if (FILENAME_MAP[filename]) return FILENAME_MAP[filename];

  // Check extension
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex >= 0) {
    const ext = filename.slice(dotIndex).toLowerCase();
    if (EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
  }

  return 'plaintext';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface UseFileViewerReturn {
  /** List of open file tabs */
  openFiles: OpenFileEntry[];
  /** Currently active (visible) file entry, or null */
  activeFile: OpenFileEntry | null;
  /** Open a file — fetches content and adds/activates tab. If host `onOpenFile` is set, delegates to host instead. */
  openFile: (path: string, line?: number | null) => void;
  /** Close a file tab */
  closeFile: (path: string) => void;
  /** Switch the active tab */
  setActiveFile: (path: string) => void;
  /** Line number to reveal in the editor (consumed after use) */
  revealLine: number | null;
  /** Clear the reveal line after it has been consumed */
  clearRevealLine: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFileViewer(): UseFileViewerReturn {
  const { onOpenFile, readFileContent } = usePlatform();
  const [openFiles, setOpenFiles] = useState<OpenFileEntry[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [revealLine, setRevealLine] = useState<number | null>(null);
  // Track in-flight requests to avoid duplicate fetches
  const inflightRef = useRef<Set<string>>(new Set());

  const openFile = useCallback((path: string, line?: number | null) => {
    // If host provides onOpenFile, delegate entirely
    if (onOpenFile) {
      onOpenFile(path, line);
      return;
    }

    // Set reveal line
    if (line != null) {
      setRevealLine(line);
    }

    setOpenFiles((prev) => {
      const existing = prev.find((f) => f.path === path);
      if (existing) {
        // Already open — just activate
        setActiveFilePath(path);
        return prev;
      }

      // Add new tab with loading state
      const entry: OpenFileEntry = {
        path,
        content: '',
        language: detectLanguage(path),
        loading: true,
        error: null,
      };

      setActiveFilePath(path);

      // Fetch content asynchronously
      if (readFileContent && !inflightRef.current.has(path)) {
        inflightRef.current.add(path);
        readFileContent(path)
          .then((content) => {
            setOpenFiles((curr) =>
              curr.map((f) =>
                f.path === path ? { ...f, content, loading: false } : f,
              ),
            );
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            setOpenFiles((curr) =>
              curr.map((f) =>
                f.path === path ? { ...f, error: msg, loading: false } : f,
              ),
            );
          })
          .finally(() => {
            inflightRef.current.delete(path);
          });
      } else if (!readFileContent) {
        // No reader configured
        setOpenFiles((curr) =>
          curr.map((f) =>
            f.path === path
              ? { ...f, error: 'File reading not configured', loading: false }
              : f,
          ),
        );
      }

      return [...prev, entry];
    });
  }, [onOpenFile, readFileContent]);

  const closeFile = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const idx = prev.findIndex((f) => f.path === path);
      if (idx === -1) return prev;

      const next = prev.filter((f) => f.path !== path);

      // If closing the active tab, switch to adjacent
      setActiveFilePath((currentActive) => {
        if (currentActive !== path) return currentActive;
        if (next.length === 0) return null;
        // Prefer the tab to the right, fall back to left
        const newIdx = Math.min(idx, next.length - 1);
        return next[newIdx].path;
      });

      return next;
    });
  }, []);

  const setActiveFile = useCallback((path: string) => {
    setActiveFilePath(path);
  }, []);

  const clearRevealLine = useCallback(() => {
    setRevealLine(null);
  }, []);

  const activeFile = openFiles.find((f) => f.path === activeFilePath) ?? null;

  return {
    openFiles,
    activeFile,
    openFile,
    closeFile,
    setActiveFile,
    revealLine,
    clearRevealLine,
  };
}
