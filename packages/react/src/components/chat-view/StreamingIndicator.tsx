import React from 'react';
import styles from './chat-view.module.scss';

export function StreamingIndicator() {
  return (
    <div className={styles.acpStreamingIndicator} aria-label="Agent is thinking" role="status">
      <span>Generating</span>
      <span className={styles.acpStreamingIndicatorDots}>
        <span className={styles.acpStreamingIndicatorDot} />
        <span className={styles.acpStreamingIndicatorDot} />
        <span className={styles.acpStreamingIndicatorDot} />
      </span>
    </div>
  );
}
