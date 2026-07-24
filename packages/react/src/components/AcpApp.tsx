import { type ReactNode } from 'react';
import { type Platform } from '../context/PlatformContext';
import { PlatformProvider } from './platform';
import { HotkeysProvider } from '../context/HotkeysContext';
import { I18nProvider } from '../i18n';
import { AcpProvider } from './workbench/AcpProvider';
import type { AgentConfig } from '@acp-components/core';

// ---------------------------------------------------------------------------
// Composite root provider. Wraps the four-provider stack that every host
// entry point needs:
//
//   PlatformProvider  (native capabilities / OS / storage / fs / menu)
//     > HotkeysProvider   (action registry + native-menu integration)
//       > I18nProvider     (translations)
//         > AcpProvider     (ACP client / stores / agent connections)
//
// The nesting order is dependency-driven: Platform is outermost (the others
// call usePlatform()), AcpProvider is innermost (uses platform.storage). Use
// this as a single entry point; drop down to the individual providers only
// when you need fine-grained control (e.g. autoWorkspaces={false}).
// ---------------------------------------------------------------------------

export interface AcpAppProps {
  /** Host platform (native capabilities). Required. */
  platform: Platform;
  /** Built-in agent set (host defaults). */
  agents?: AgentConfig[];
  /** Initial UI theme. Default 'dark'. */
  theme?: 'light' | 'dark';
  /** App content. */
  children: ReactNode;
}

export function AcpApp({
  platform,
  agents,
  theme = 'dark',
  children,
}: AcpAppProps) {
  return (
    <PlatformProvider platform={platform}>
      <HotkeysProvider>
        <I18nProvider>
          <AcpProvider agents={agents} theme={theme}>
            {children}
          </AcpProvider>
        </I18nProvider>
      </HotkeysProvider>
    </PlatformProvider>
  );
}
