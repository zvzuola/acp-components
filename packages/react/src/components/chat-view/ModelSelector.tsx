import React from 'react';
import { useSession, useAcpContext, useSessionStore } from '@acp-components/core';
import type { SessionId, ModelId } from '@agentclientprotocol/sdk';
import styles from './model-selector.module.scss';

export interface ModelSelectorProps {
  sessionId: SessionId | null;
}

export function ModelSelector({ sessionId }: ModelSelectorProps) {
  const { availableModels, currentModelId } = useSession(sessionId);
  const { client } = useAcpContext();

  if (!sessionId || availableModels.length === 0) return null;

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value as ModelId;
    if (modelId !== currentModelId) {
      useSessionStore.getState().setCurrentModel(sessionId, modelId);
      try {
        await client.setSessionModel(sessionId, modelId);
      } catch {
        // revert on failure
        useSessionStore.getState().setCurrentModel(sessionId, currentModelId);
      }
    }
  };

  return (
    <div className={styles.acpModelSelector}>
      <select
        className={styles.acpModelSelectorSelect}
        value={currentModelId ?? ''}
        onChange={handleModelChange}
        aria-label="Select model"
      >
        {availableModels.map((m) => (
          <option key={m.modelId} value={m.modelId}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
