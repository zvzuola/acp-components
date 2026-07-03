import { SessionList } from '../session-list';
import { SettingsMenu } from '../settings-menu/SettingsMenu';
import styles from './sidebar.module.scss';

export interface SidebarProps {
  /** Extra class on the root */
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  return (
    <div className={`${styles.acpSidebar}${className ? ` ${className}` : ''}`}>
      <div className={styles.acpSidebarSessions}>
        <SessionList />
      </div>
      <SettingsMenu />
    </div>
  );
}
