import React, { useState, useCallback, useEffect } from 'react';
import { CopyOutlined, CheckOutlined, EditOutlined } from '@ant-design/icons';
import { useI18n } from '../../i18n';
import { usePlatform } from '../../context/PlatformContext';
import styles from './user-message.module.scss';

export interface UserMessageActionsProps {
  textContent: string;
  onEdit: (text: string) => void;
}

export function UserMessageActions({ textContent, onEdit }: UserMessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();
  const { clipboard } = usePlatform();

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    // Delegated to the platform slice so hosts can back it with a native
    // clipboard (e.g. tauri-plugin-clipboard-manager) instead of the browser
    // API. Absent slice → no-op (the button stays a plain affordance).
    try {
      await clipboard?.writeText(textContent);
      setCopied(true);
    } catch {
      // clipboard write failed, silently ignore
    }
  }, [textContent, clipboard]);

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
        {copied ? <CheckOutlined /> : <CopyOutlined />}
      </button>
      <button
        className={styles.acpUserMessageActionBtn}
        onClick={handleEdit}
        aria-label={t('userMessage.edit')}
        title={t('userMessage.edit')}
      >
        <EditOutlined />
      </button>
    </div>
  );
}
