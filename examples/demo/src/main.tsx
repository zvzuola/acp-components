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
import { createWebPlatform } from './webPlatform';

// In web environments, stdio transport is unavailable (can't spawn child processes).
// Use WebSocket transport connected to the acp-server backend, which bridges
// the agent's stdio to WebSocket.
//
//   cd examples/server && pnpm dev
//
// For local Electron/Tauri/desktop where stdio works, switch back to:
//   transport: { type: 'stdio', command: 'opencode', args: ['acp'] }

function AppInner() {
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  // WorkbenchShell drives the whole layout: the Sidebar (top nav buttons +
  // switchable body + footer) on the left, and a main area that swaps views
  // based on the active nav item (Sessions → SessionView, Skills → SkillView).
  // SkillView fetches its catalog live from each connected agent's
  // `listSkills()` on mount (via `useSkills`), so no skill props are passed
  // here.
  return (
    <>
      <WorkbenchShell sessionId={activeSessionId} />
      <LoginDialog />
    </>
  );
}

function App() {
  return (
    <AcpApp
      platform={createWebPlatform()}
      agents={[{
        id: 'opencode',
        name: 'OpenCode',
        transport: {
          type: 'websocket',
          url: 'ws://127.0.0.1:3100',
        },
      }]}
      theme="dark"
    >
      <AppInner />
    </AcpApp>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
