import React, { useEffect, useRef } from 'react';
import { usePermission } from '@acp-components/core';
import type { SessionId } from '@agentclientprotocol/sdk';
import styles from './permission-dialog.module.scss';

export interface PermissionDialogProps {
  sessionId: SessionId | null;
}

export function PermissionDialog({ sessionId }: PermissionDialogProps) {
  const { currentRequest, respond, deny } = usePermission(sessionId);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentRequest && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [currentRequest]);

  if (!currentRequest || !sessionId) return null;

  const [allowOnce, allowAlways, denyOnce] = currentRequest.options;

  return (
    <div className={styles.acpPermissionDialogOverlay} role="dialog" aria-modal="true" aria-label="Permission required">
      <div className={styles.acpPermissionDialog} ref={dialogRef} tabIndex={-1}>
        <h3 className={styles.acpPermissionDialogTitle}>Permission Required</h3>
        <p className={styles.acpPermissionDialogDesc}>
          The agent wants to execute a tool that requires your approval.
        </p>
        <div className={styles.acpPermissionDialogTool}>
          <div className={styles.acpPermissionDialogToolName}>{currentRequest.toolCall.title}</div>
          {currentRequest.toolCall.rawInput != null && (
            <pre className={styles.acpPermissionDialogToolArgs}>
              {JSON.stringify(currentRequest.toolCall.rawInput, null, 2)}
            </pre>
          )}
        </div>
        <div className={styles.acpPermissionDialogActions}>
          <button
            className={`${styles.acpPermissionDialogBtn} ${styles.acpPermissionDialogBtnDeny}`}
            onClick={() => deny(sessionId)}
          >
            {denyOnce?.name || 'Deny'}
          </button>
          <button
            className={`${styles.acpPermissionDialogBtn} ${styles.acpPermissionDialogBtnAllow}`}
            onClick={() => respond(sessionId, allowAlways?.optionId || allowOnce?.optionId || '')}
            autoFocus
          >
            {allowAlways?.name || allowOnce?.name || 'Allow'}
          </button>
        </div>
      </div>
    </div>
  );
}
