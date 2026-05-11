import React from 'react';
import { useAcpContext, useSession, useSessionStore } from '@acp-components/core';
import type { SessionId, SessionModeId } from '@agentclientprotocol/sdk';
import styles from './session-mode-selector.module.scss';

export interface SessionModeSelectorProps {
  sessionId: SessionId | null;
}

export function SessionModeSelector({ sessionId }: SessionModeSelectorProps) {
  const { availableModes, currentModeId } = useSession(sessionId);
  const { client } = useAcpContext();

  if (!sessionId || availableModes.length === 0) return null;

  const handleModeChange = async (modeId: SessionModeId) => {
    const prevModeId = currentModeId;
    useSessionStore.getState().setCurrentMode(sessionId, modeId);
    try {
      await client.setSessionMode(sessionId, modeId);
    } catch {
      useSessionStore.getState().setCurrentMode(sessionId, prevModeId);
    }
  };

  return (
    <div className={styles.acpSessionModeSelector}>
      <select
        className={styles.acpSessionModeSelectorSelect}
        value={currentModeId ?? ''}
        onChange={(e) => handleModeChange(e.target.value as SessionModeId)}
        aria-label="Select session mode"
      >
        {availableModes.map((mode) => (
          <option key={mode.id} value={mode.id}>
            {mode.name}
          </option>
        ))}
      </select>
    </div>
  );
}
