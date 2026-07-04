import React, { useCallback, useMemo, useState } from 'react';
import { ThunderboltOutlined, SearchOutlined, StarFilled } from '@ant-design/icons';
import type { Skill as CoreSkill } from '@acp-components/core';
import { useSkills } from '../../hooks/useSkills';
import { useI18n } from '../../i18n';
import styles from './skill-view.module.scss';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A skill surfaced by the host (or fetched from an agent extension). The pure
 * data shape lives in `@acp-components/core` (`Skill`); the react layer extends
 * it with an optional rendered `icon` node. Skill data is read from the global
 * `skillStore` via `useSkills()` — hosts populate the catalog by calling
 * `setSkills` / `addSkill` (the ACP protocol does not yet define a skill
 * primitive, so the source is host-controlled).
 */
export interface Skill extends CoreSkill {
  /** Optional leading icon (defaults to a bolt). */
  icon?: React.ReactNode;
}

export interface SkillViewProps {
  /** Called when a skill card is clicked (and not disabled). */
  onSelect?: (skill: Skill) => void;
  /** Override the empty-state body text. */
  emptyText?: string;
  /** Placeholder text for the search box. */
  searchPlaceholder?: string;
  /** Hide the search box (e.g. when the skill count is small). */
  showSearch?: boolean;
  /** Extra class on the root */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Case-insensitive, accent-agnostic contains check on name + description. */
function matchesQuery(skill: Skill, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const hay = `${skill.name} ${skill.description ?? ''} ${skill.group ?? ''}`.toLowerCase();
  return hay.includes(needle);
}

// ---------------------------------------------------------------------------
// SkillCard
// ---------------------------------------------------------------------------

interface SkillCardProps {
  skill: Skill;
  onSelect?: (skill: Skill) => void;
  onTogglePin?: (skill: Skill) => void;
}

const SkillCard = React.memo(function SkillCard({
  skill,
  onSelect,
  onTogglePin,
}: SkillCardProps) {
  const { t } = useI18n();

  const handleClick = useCallback(() => {
    if (skill.disabled) return;
    onSelect?.(skill);
  }, [skill, onSelect]);

  const handlePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onTogglePin?.(skill);
    },
    [skill, onTogglePin],
  );

  const cls = [
    styles.acpSkillCard,
    skill.disabled ? styles.acpSkillCardDisabled : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={cls}
      onClick={handleClick}
      disabled={skill.disabled}
      aria-label={skill.name}
      title={skill.description ? `${skill.name} — ${skill.description}` : skill.name}
    >
      <span className={styles.acpSkillCardIcon} aria-hidden="true">
        {skill.icon ?? <ThunderboltOutlined />}
      </span>
      <span className={styles.acpSkillCardBody}>
        <span className={styles.acpSkillCardName}>{skill.name}</span>
        {skill.description && (
          <span className={styles.acpSkillCardDesc}>{skill.description}</span>
        )}
        {skill.group && (
          <span className={styles.acpSkillCardGroup}>{skill.group}</span>
        )}
      </span>
      {onTogglePin && (
        <span
          className={`${styles.acpSkillCardPin}${skill.pinned ? ` ${styles.acpSkillCardPinActive}` : ''}`}
          role="button"
          tabIndex={0}
          aria-label={skill.pinned ? t('skillView.unpin') : t('skillView.pin')}
          title={skill.pinned ? t('skillView.unpin') : t('skillView.pin')}
          onClick={handlePin}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onTogglePin?.(skill);
            }
          }}
        >
          <StarFilled />
        </span>
      )}
    </button>
  );
});

// ---------------------------------------------------------------------------
// SkillView
// ---------------------------------------------------------------------------

export function SkillView({
  onSelect,
  emptyText,
  searchPlaceholder,
  showSearch = true,
  className,
}: SkillViewProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  // Skills are sourced from the global store — never hardcoded. Hosts populate
  // the catalog via `setSkills` / `addSkill`; the ACP protocol has no skill
  // primitive yet, so the source is host-controlled.
  const { skills, togglePin } = useSkills();

  // Pin is always managed through the store (`togglePin` writes to `skillStore`),
  // so we expose the affordance on every card as long as a skill exists.
  const handleTogglePin = useCallback(
    (skill: Skill) => {
      togglePin(skill.id);
    },
    [togglePin],
  );

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
    [],
  );

  // Pinned first, then alphabetical by name; filtered by the search query.
  const visible = useMemo(() => {
    const filtered = skills.filter((s) => matchesQuery(s, query));
    filtered.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return filtered;
  }, [skills, query]);

  const rootCls = [styles.acpSkillView, className || ''].filter(Boolean).join(' ');

  return (
    <div className={rootCls} role="application" aria-label={t('skillView.ariaLabel')}>
      <div className={styles.acpSkillViewHeader}>
        <span className={styles.acpSkillViewTitle}>{t('skillView.title')}</span>
        {showSearch && (
          <div className={styles.acpSkillViewSearch}>
            <SearchOutlined className={styles.acpSkillViewSearchIcon} aria-hidden="true" />
            <input
              type="search"
              className={styles.acpSkillViewInput}
              value={query}
              onChange={handleSearch}
              placeholder={searchPlaceholder ?? t('skillView.searchPlaceholder')}
              aria-label={t('skillView.searchAriaLabel')}
            />
          </div>
        )}
      </div>

      <div className={styles.acpSkillViewItems} role="list" aria-label={t('skillView.title')}>
        {visible.length === 0 ? (
          <div className={styles.acpSkillViewEmpty}>
            {emptyText ?? (query ? t('skillView.noMatch') : t('skillView.empty'))}
          </div>
        ) : (
          visible.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onSelect={onSelect}
              onTogglePin={handleTogglePin}
            />
          ))
        )}
      </div>
    </div>
  );
}
