import React from 'react';
import { useI18n } from '../../i18n';
import styles from './chat-view.module.scss';

export function StreamingIndicator() {
  const { t } = useI18n();
  return (
    <div className={styles.acpStreamingIndicator} aria-label={t('streaming.ariaLabel')} role="status">
      <span>{t('streaming.generating')}</span>
      <span className={styles.acpStreamingIndicatorDots}>
        <span className={styles.acpStreamingIndicatorDot} />
        <span className={styles.acpStreamingIndicatorDot} />
        <span className={styles.acpStreamingIndicatorDot} />
      </span>
    </div>
  );
}
