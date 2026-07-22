import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { useFileViewer } from '../../hooks/useFileViewer';
import { defineMonacoThemes, getMonacoTheme } from '../../utils/monacoTheme';
import { useI18n } from '../../i18n';
import { useSettings } from '../../context/SettingsContext';
import styles from './file-viewer.module.scss';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileViewerProps {
  /** Additional CSS class */
  className?: string;
}

// ---------------------------------------------------------------------------
// Monaco lazy loader
// ---------------------------------------------------------------------------

type MonacoModule = typeof import('monaco-editor');

let monacoPromise: Promise<MonacoModule> | null = null;

function loadMonaco(): Promise<MonacoModule> {
  if (monacoPromise) return monacoPromise;
  monacoPromise = import('monaco-editor').catch(() => {
    monacoPromise = null;
    throw new Error('monaco-editor is not installed. Install it as a peer dependency.');
  });
  return monacoPromise;
}

// ---------------------------------------------------------------------------
// FileViewer component
// ---------------------------------------------------------------------------

export function FileViewer({ className }: FileViewerProps) {
  const { t } = useI18n();
  const { openFiles, activeFile, closeFile, setActiveFile, revealLine, clearRevealLine } =
    useFileViewer();
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<import('monaco-editor').editor.ITextModel | null>(null);
  const [monaco, setMonaco] = useState<MonacoModule | null>(null);
  const [monacoError, setMonacoError] = useState<string | null>(null);
  const [loadingMonaco, setLoadingMonaco] = useState(true);

  // Theme comes from SettingsContext so the editor follows live theme
  // switches. Reading `data-acp-theme` once on mount (as before) missed any
  // change made afterwards, leaving the Monaco theme stuck.
  const { theme } = useSettings();

  // Lazy load Monaco
  useEffect(() => {
    let cancelled = false;
    setLoadingMonaco(true);
    loadMonaco()
      .then((m) => {
        if (!cancelled) {
          setMonaco(m);
          setLoadingMonaco(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setMonacoError(err.message);
          setLoadingMonaco(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Create Monaco editor instance
  useEffect(() => {
    if (!monaco || !editorContainerRef.current) return;

    // Register custom ACP themes so the editor canvas matches the panel
    // background before the editor instance is created.
    defineMonacoThemes(monaco);

    const monacoTheme = getMonacoTheme(theme);

    const editor = monaco.editor.create(editorContainerRef.current, {
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      fontSize: 13,
      fontFamily: "var(--acp-font-mono, 'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace)",
      lineNumbers: 'on',
      renderLineHighlight: 'line',
      theme: monacoTheme,
      padding: { top: 8 },
      scrollbar: {
        verticalScrollbarSize: 6,
        horizontalScrollbarSize: 6,
      },
      wordWrap: 'on',
    });

    editorRef.current = editor;

    return () => {
      editor.dispose();
      editorRef.current = null;
      if (modelRef.current) {
        modelRef.current.dispose();
        modelRef.current = null;
      }
    };
    // `theme` is read only for the editor's initial theme; live theme changes
    // are applied by the dedicated updateOptions effect below, so we keep the
    // editor alive across theme switches (no dispose/recreate, view state
    // preserved) instead of rebuilding on every toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco]);

  // Update Monaco theme when theme changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({ theme: getMonacoTheme(theme) });
    }
  }, [theme]);

  // Update model when active file changes
  useEffect(() => {
    if (!monaco || !editorRef.current || !activeFile) return;

    // Dispose previous model
    if (modelRef.current) {
      modelRef.current.dispose();
      modelRef.current = null;
    }

    if (activeFile.loading || activeFile.error) {
      // Clear the editor for loading/error states
      const emptyModel = monaco.editor.createModel('', 'plaintext');
      modelRef.current = emptyModel;
      editorRef.current.setModel(emptyModel);
      return;
    }

    const model = monaco.editor.createModel(activeFile.content, activeFile.language);
    modelRef.current = model;
    editorRef.current.setModel(model);
    // Field-level deps are intentional: we rebuild the model only when these
    // specific fields change, not on every `activeFile` reference change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco, activeFile?.path, activeFile?.loading, activeFile?.error, activeFile?.content]);

  // Reveal line when requested
  useEffect(() => {
    if (revealLine != null && editorRef.current) {
      // Small delay to ensure model is set
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.revealLineInCenter(revealLine);
          editorRef.current.focus();
        }
        clearRevealLine();
      });
    }
  }, [revealLine, activeFile?.path, clearRevealLine]);

  // Handle tab close (stop propagation)
  const handleTabClose = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      closeFile(path);
    },
    [closeFile],
  );

  // Get filename from path
  const getFilename = (path: string) => {
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || path;
  };

  // Get parent directory for disambiguation
  const getDirectory = (path: string) => {
    const parts = path.replace(/\\/g, '/').split('/');
    return parts.slice(0, -1).join('/') || '';
  };

  if (openFiles.length === 0) return null;

  return (
    <div
      className={`${styles.acpFileViewer}${className ? ` ${className}` : ''}`}
    >
      {/* Tab bar */}
      <div className={styles.acpFileViewerTabs} role="tablist">
        {openFiles.map((file) => (
          <button
            key={file.path}
            className={`${styles.acpFileViewerTab}${file.path === activeFile?.path ? ` ${styles.acpFileViewerTabActive}` : ''}`}
            onClick={() => setActiveFile(file.path)}
            role="tab"
            aria-selected={file.path === activeFile?.path}
            title={file.path}
          >
            <span className={styles.acpFileViewerTabName}>
              {getFilename(file.path)}
            </span>
            <span
              className={styles.acpFileViewerTabClose}
              onClick={(e) => handleTabClose(e, file.path)}
              role="button"
              tabIndex={0}
              aria-label={`${t('fileViewer.close')} ${getFilename(file.path)}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  closeFile(file.path);
                }
              }}
            >
              <CloseOutlined />
            </span>
          </button>
        ))}
      </div>

      {/* File path breadcrumb */}
      {activeFile && (
        <div className={styles.acpFileViewerBreadcrumb}>
          <span className={styles.acpFileViewerBreadcrumbPath} title={getDirectory(activeFile.path)}>
            {getDirectory(activeFile.path)}
          </span>
          <span className={styles.acpFileViewerBreadcrumbSep}>/</span>
          <span className={styles.acpFileViewerBreadcrumbFile}>
            {getFilename(activeFile.path)}
          </span>
        </div>
      )}

      {/* Editor area */}
      <div className={styles.acpFileViewerEditor}>
        {loadingMonaco && (
          <div className={styles.acpFileViewerLoading}>
            <div className={styles.acpFileViewerSpinner} />
            <span>{t('fileViewer.loadingMonaco')}</span>
          </div>
        )}

        {monacoError && (
          <div className={styles.acpFileViewerError}>
            <span className={styles.acpFileViewerErrorIcon}>⚠</span>
            <span>{monacoError}</span>
          </div>
        )}

        {activeFile?.loading && !loadingMonaco && (
          <div className={styles.acpFileViewerLoading}>
            <div className={styles.acpFileViewerSpinner} />
            <span>{t('fileViewer.loading')}</span>
          </div>
        )}

        {activeFile?.error && !loadingMonaco && (
          <div className={styles.acpFileViewerError}>
            <span className={styles.acpFileViewerErrorIcon}>⚠</span>
            <span>{t('fileViewer.error')}: {activeFile.error}</span>
          </div>
        )}

        {/* Monaco editor container — always rendered, visibility controlled by CSS */}
        <div
          ref={editorContainerRef}
          className={styles.acpFileViewerMonaco}
          style={{
            display: monaco && activeFile && !activeFile.loading && !activeFile.error && !loadingMonaco && !monacoError
              ? 'block'
              : 'none',
          }}
        />
      </div>
    </div>
  );
}
