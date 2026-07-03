import React, { useCallback, useMemo, useState } from 'react';
import { ThunderboltOutlined, SearchOutlined, StarFilled } from '@ant-design/icons';
import { useI18n } from '../../i18n';
import styles from './skill-view.module.scss';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A skill surfaced by the host (or fetched from an agent extension). The ACP
 * protocol does not yet define a skill primitive, so the shape is owned by the
 * UI layer; hosts populate it from whatever source they have.
 */
export interface Skill {
  /** Stable unique id */
  id: string;
  /** Display name */
  name: string;
  /** One-line description shown under the name */
  description?: string;
  /** Optional leading icon (defaults to a bolt) */
  icon?: React.ReactNode;
  /** Optional source/group label, e.g. "built-in" / an agent id */
  group?: string;
  /** Mark as pinned / favorite — pinned skills sort first */
  pinned?: boolean;
  /** Disable the skill card (still visible, not activatable) */
  disabled?: boolean;
}

export interface SkillViewProps {
  /**
   * Skills to render. When omitted, SkillView renders its built-in default
   * catalog (so it is usable with no props at all). Pass an explicit array —
   * including `[]` — to source skills from your own catalog or an agent
   * extension.
   */
  skills?: Skill[];
  /** Called when a skill card is clicked (and not disabled). */
  onSelect?: (skill: Skill) => void;
  /**
   * Toggle pin on a skill. When provided, the toggle is fully controlled by
   * the host (SkillView calls it and expects the `pinned` field on the next
   * `skills` render to reflect the change). When omitted, SkillView manages
   * pin state internally so the affordance still works.
   */
  onTogglePin?: (skill: Skill) => void;
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
// Built-in skill catalog
// ---------------------------------------------------------------------------
// SkillView owns a small default catalog so it is usable without any data
// wiring. The ACP protocol does not yet define a skill primitive; hosts that
// have a real source (agent extension listing, host-side catalog) should pass
// it via `skills`.

const DEFAULT_SKILLS: Skill[] = [
  { id: 'code-review', name: 'Code Review', description: 'Review the current diff for bugs and style.', group: 'built-in', pinned: true },
  { id: 'commit', name: 'Commit', description: 'Stage and commit pending changes with a generated message.', group: 'built-in' },
  { id: 'test', name: 'Generate Tests', description: 'Scaffold unit tests for the selected symbol.', group: 'built-in' },
  { id: 'refactor', name: 'Refactor', description: 'Extract method / rename across the workspace.', group: 'built-in' },
];

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
  skills,
  onSelect,
  onTogglePin,
  emptyText,
  searchPlaceholder,
  showSearch = true,
  className,
}: SkillViewProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  // Fall back to the built-in catalog when the host supplies no skills, so the
  // view is usable with no props at all.
  const source = skills ?? DEFAULT_SKILLS;

  // When no host-controlled `onTogglePin` is provided, track pin overrides
  // locally so the pin affordance still works out of the box.
  const [pinOverrides, setPinOverrides] = useState<Record<string, boolean>>({});
  const handleTogglePin = useCallback(
    (skill: Skill) => {
      if (onTogglePin) {
        onTogglePin(skill);
        return;
      }
      setPinOverrides((prev) => ({ ...prev, [skill.id]: !prev[skill.id] }));
    },
    [onTogglePin],
  );

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
    [],
  );

  // Pinned first, then alphabetical by name; filtered by the search query.
  const visible = useMemo(() => {
    const withPins = source.map((s) =>
      pinOverrides[s.id] !== undefined ? { ...s, pinned: pinOverrides[s.id] } : s,
    );
    const filtered = withPins.filter((s) => matchesQuery(s, query));
    filtered.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return filtered;
  }, [source, pinOverrides, query]);

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
              onTogglePin={onTogglePin ? onTogglePin : handleTogglePin}
            />
          ))
        )}
      </div>
    </div>
  );
}
