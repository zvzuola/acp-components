import React, { useState, useCallback, useEffect } from 'react';
import { useI18n } from '../../i18n';
import styles from './user-message.module.scss';

export interface UserMessageActionsProps {
  textContent: string;
  onEdit: (text: string) => void;
}

export function UserMessageActions({ textContent, onEdit }: UserMessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
    } catch {
      // clipboard API unavailable, silently ignore
    }
  }, [textContent]);

  const handleEdit = useCallback(() => {
    onEdit(textContent);
  }, [textContent, onEdit]);

  return (
    <div className={styles.acpUserMessageActions}>
      <button
        className={`${styles.acpUserMessageActionBtn} ${copied ? styles.acpUserMessageActionBtnCopied : ''}`}
        onClick={handleCopy}
        aria-label={t('userMessage.copy')}
        title={t('userMessage.copy')}
      >
        {copied ? '✓' : '⎘'}
      </button>
      <button
        className={styles.acpUserMessageActionBtn}
        onClick={handleEdit}
        aria-label={t('userMessage.edit')}
        title={t('userMessage.edit')}
      >
        {'✎'}
      </button>
    </div>
  );
}
