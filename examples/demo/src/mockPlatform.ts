import type { FileTreeNode, Platform } from '@acp-components/react';
import { createWebPlatform } from './webPlatform';

export const DEMO_CWD = '/demo/acp-components';

const files = new Map<string, string>([
  [`${DEMO_CWD}/README.md`, `# acp-components

Production-ready React components and a framework-agnostic core for building Agent Client Protocol clients.

This file is served by the browser-only demo platform.
`],
  [`${DEMO_CWD}/packages/core/src/provider.ts`, `export function createAcpProvider(options: MultiAgentProviderOptions) {
  // Connect agents, route ACP updates, and keep framework-agnostic stores in sync.
  return createProvider(options);
}
`],
  [`${DEMO_CWD}/packages/react/src/WorkbenchShell.tsx`, `export function WorkbenchShell() {
  const title = 'Agent workspace';
  return <Workbench title={title} />;
}
`],
]);

function childrenOf(path: string): FileTreeNode[] {
  const prefix = `${path.replace(/\/$/, '')}/`;
  const children = new Map<string, FileTreeNode>();

  for (const filePath of files.keys()) {
    if (!filePath.startsWith(prefix)) continue;
    const remainder = filePath.slice(prefix.length);
    const [name, ...rest] = remainder.split('/');
    if (!name) continue;
    const childPath = `${prefix}${name}`;
    children.set(name, {
      name,
      path: childPath,
      kind: rest.length > 0 ? 'directory' : 'file',
    });
  }

  return Array.from(children.values()).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function createMockPlatform(): Platform {
  const platform = createWebPlatform();
  const dialogs = platform.dialogs;
  if (!dialogs) throw new Error('Web demo platform must provide dialogs');
  return {
    ...platform,
    fs: {
      readDirectory: async (path) => childrenOf(path),
      readFileContent: async (path) => {
        const content = files.get(path);
        if (content === undefined) throw new Error(`Demo file not found: ${path}`);
        return content;
      },
    },
    dialogs: {
      openLink: dialogs.openLink,
      notify: dialogs.notify,
      openFilePicker: async () => DEMO_CWD,
    },
  };
}
