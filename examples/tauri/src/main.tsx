import ReactDOM from 'react-dom/client';
// @ts-expect-error Vite worker imports — types not available for ?worker suffix
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
// @ts-expect-error Vite worker imports
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
// @ts-expect-error Vite worker imports
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
// @ts-expect-error Vite worker imports
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
// @ts-expect-error Vite worker imports
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Monaco requires MonacoEnvironment.getWorker to spawn language-specific web workers.
// Without this, Monaco falls back to running workers on the main thread (causing UI freezes)
// and fails on $loadForeignModule because FileAccessImpl.toUrl is unavailable outside a worker.
// @ts-expect-error Monaco global worker environment — typed by monaco-editor, not available here
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

import { AcpApp } from '@acp-components/react';
import { WorkbenchShell } from '@acp-components/react';
import { LoginDialog } from '@acp-components/react';
import { useAcpStore } from '@acp-components/react';
import { createTauriPlatform } from './tauriPlatform';
import { TitleBar } from './TitleBar';
import styles from './app.module.scss';

// The agent is configured as a plain-data `{ type: 'stdio' }` transport. The
// actual spawn capability is supplied by `Platform.process.createStdioTransport`
// (see tauriPlatform.ts → createTauriStdioTransport), which the Rust backend
// backs: it spawns the agent process and bridges stdin/stdout through Tauri
// commands/events (TauriIpcTransport). No WebSocket server needed.
//
// To customize the agent binary or arguments, just edit the command/args below
// — it is plain data and round-trips through JSON storage, unlike a `custom`
// transport carrying a live instance.

function AppInner() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  // WorkbenchShell drives the whole layout: the Sidebar (top nav buttons +
  // switchable body + footer) on the left, and a main area that swaps views
  // based on the active nav item (Sessions → SessionView, Skills → SkillView).
  return (
    <>
      <div className={styles.app}>
        <TitleBar />
        <div className={styles.appBody}>
          <WorkbenchShell sessionId={activeSessionId} className={styles.workbench} />
        </div>
      </div>
      <LoginDialog />
    </>
  );
}

function App() {
  return (
    <AcpApp
      platform={createTauriPlatform()}
      agents={[{
        id: 'default',
        name: 'OpenCode',
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['opencode-ai@latest', 'acp'],
        },
      }]}
      theme="dark"
    >
      <AppInner />
    </AcpApp>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
