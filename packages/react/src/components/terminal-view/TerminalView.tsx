import React, { useState } from 'react';
import { useStore } from 'zustand/react';
import { RightOutlined, DownOutlined } from '@ant-design/icons';
import type { SessionId, TerminalState } from '@acp-components/core';
import { sessionStore } from '@acp-components/core';
import { useTerminals } from '../../hooks/useTerminals';
import { useI18n } from '../../i18n';
import styles from './terminal-view.module.scss';

export interface TerminalViewProps {
  sessionId?: SessionId | null;
  /** If provided, only this terminal is shown (targeted subscription). */
  terminalId?: string;
}

export function TerminalView({ sessionId, terminalId }: TerminalViewProps) {
  const { t } = useI18n();
  const hookTerminals = useTerminals(sessionId ?? null);

  // Targeted subscription for a single terminal (avoids scanning all sessions)
  const singleTerminal = useStore(sessionStore, (s) => {
    if (!sessionId || !terminalId) return undefined;
    return s.sessions.get(sessionId)?.terminals.get(terminalId);
  });

  // Resolve terminals: single terminal lookup > all session terminals
  let terminals: TerminalState[];
  if (terminalId) {
    terminals = singleTerminal
      ? [singleTerminal]
      : [{ terminalId, command: '', output: '', exitStatus: null, truncated: false }];
  } else {
    terminals = hookTerminals;
  }

  if (terminals.length === 0) {
    return (
      <div className={styles.acpTerminalView}>
        <div className={styles.acpTerminalViewHeader}>
          {t('terminal.title')}
        </div>
        <div className={styles.acpTerminalEmpty}>{t('terminal.empty')}</div>
      </div>
    );
  }

  return (
    <div className={styles.acpTerminalView}>
      <div className={styles.acpTerminalViewHeader}>
        {t('terminal.title')}
        <span className={styles.acpTerminalCount}>{terminals.length}</span>
      </div>
      <div className={styles.acpTerminalList}>
        {terminals.map((terminal) => (
          <TerminalItem key={terminal.terminalId} terminal={terminal} t={t} />
        ))}
      </div>
    </div>
  );
}

function TerminalItem({ terminal, t }: { terminal: TerminalState; t: (key: string, params?: Record<string, unknown>) => string }) {
  const [collapsed, setCollapsed] = useState(false);
  const isRunning = terminal.exitStatus === null;
  const hasExitCode = terminal.exitStatus?.exitCode != null;

  return (
    <div className={`${styles.acpTerminalItem} ${isRunning ? styles.acpTerminalItemRunning : ''}`}>
      <button
        type="button"
        className={styles.acpTerminalItemHeader}
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
      >
        <span className={styles.acpTerminalItemStatus}>
          {isRunning ? (
            <span className={styles.acpTerminalStatusDot} />
          ) : hasExitCode ? (
            <span className={`${styles.acpTerminalExitBadge} ${terminal.exitStatus!.exitCode === 0 ? styles.acpTerminalExitSuccess : styles.acpTerminalExitError}`}>
              {terminal.exitStatus!.exitCode}
            </span>
          ) : (
            <span className={styles.acpTerminalExitBadge}>{t('terminal.signaled')}</span>
          )}
        </span>
        <span className={styles.acpTerminalItemCommand}>
          <span className={styles.acpTerminalItemLabel}>{t('terminal.command')}</span>
          {terminal.command}{terminal.args ? ` ${terminal.args.join(' ')}` : ''}
        </span>
        <span className={styles.acpTerminalChevron}>{collapsed ? <RightOutlined /> : <DownOutlined />}</span>
      </button>
      {!collapsed && (
        <pre className={styles.acpTerminalItemOutput}>
          {terminal.output || (isRunning ? t('terminal.running') : '')}
          {terminal.truncated && <span className={styles.acpTerminalTruncatedNote}>{t('terminal.truncated')}</span>}
        </pre>
      )}
    </div>
  );
}
