import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ThunderboltOutlined, SearchOutlined } from '@ant-design/icons';
import type { Skill as CoreSkill } from '@acp-components/core';
import { useAcpContext } from '../../context/AcpContext';
import { useAcpStore } from '../../hooks/useAcpStore';
import { useSkills } from '../../hooks/useSkills';
import { useI18n } from '../../i18n';
import styles from './skill-view.module.scss';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A skill fetched from a connected agent. The pure data shape lives in
 * `@acp-components/core` (`Skill`); the react layer extends it with an
 * optional rendered `icon` node.
 *
 * The catalog is read from the global `skillStore` via `useSkills()` and is
 * fetched live from each connected agent's `AcpClient.listSkills()` on mount
 * (and when the connected-agent set changes), grouped by scope (user-level vs
 * per-project cwd) in the view — see `ScopeGroup`.
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
  const hay = `${skill.name} ${skill.description ?? ''} ${skill.group ?? ''} ${skill.cwd ?? ''} ${skill.agentId ?? ''}`.toLowerCase();
  return hay.includes(needle);
}

/**
 * Short label for a workspace cwd — the final path segment (basename) is the
 * most readable in a card meta line; the full path is still available via the
 * `title` attribute on the same element. Falls back to the raw cwd when there
 * is no path separator (e.g. a bare name or relative segment).
 */
function cwdLabel(cwd: string): string {
  const trimmed = cwd.replace(/[\\/]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

// ---------------------------------------------------------------------------
// SkillCard
// ---------------------------------------------------------------------------

interface SkillCardProps {
  skill: Skill;
  /** Display name of the owning agent (shown as a chip in the meta line). */
  agentName?: string;
  onSelect?: (skill: Skill) => void;
  /** Suppress the source-cwd chip — used when the card is rendered inside a
   * scope group whose header already conveys the cwd (avoids redundancy). */
  hideCwd?: boolean;
}

const SkillCard = React.memo(function SkillCard({
  skill,
  agentName,
  onSelect,
  hideCwd,
}: SkillCardProps) {
  const handleClick = useCallback(() => {
    if (skill.disabled) return;
    onSelect?.(skill);
  }, [skill, onSelect]);

  const cls = [
    styles.acpSkillCard,
    skill.disabled ? styles.acpSkillCardDisabled : '',
  ]
    .filter(Boolean)
    .join(' ');

  const showCwd = skill.cwd && !hideCwd;

  return (
    <button
      type="button"
      className={cls}
      onClick={handleClick}
      disabled={skill.disabled}
      aria-label={skill.name}
    >
      <span className={styles.acpSkillCardIcon} aria-hidden="true">
        {skill.icon ?? <ThunderboltOutlined />}
      </span>
      <span className={styles.acpSkillCardBody}>
        <span className={styles.acpSkillCardName}>{skill.name}</span>
        {skill.description && (
          <span className={styles.acpSkillCardDesc}>{skill.description}</span>
        )}
        {(skill.group || showCwd || agentName) && (
          <span className={styles.acpSkillCardMeta}>
            {skill.group && (
              <span className={styles.acpSkillCardGroup}>{skill.group}</span>
            )}
            {showCwd && (
              <span className={styles.acpSkillCardCwd} title={skill.cwd}>
                {cwdLabel(skill.cwd!)}
              </span>
            )}
            {agentName && (
              <span className={styles.acpSkillCardAgent} title={agentName}>
                {agentName}
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// ScopeGroup — a user-level or per-project slice of the skill catalog.
//
// Skills carry an optional `cwd`: when the agent returns a per-cwd grouped
// catalog, each skill is stamped with the workspace root it came from; a
// `cwd` of `null`/`undefined` marks a user-level skill (not tied to any open
// project). We bucket ALL agents' skills by `cwd ?? null` and render one
// ScopeGroup per bucket — the user scope first (cwd = null), then one per
// project cwd in stable order. Each card carries an agent chip so the owning
// agent stays visible even though agent is no longer a grouping dimension.
//
// The group is non-collapsible: a static label followed by an always-visible
// card grid. Project scopes are surfaced as a pill-nav (see `ScopeNav`) so
// the user switches between them rather than scrolling a stack of groups.
// ---------------------------------------------------------------------------

interface ScopeGroupProps {
  /** `null` for the user scope; the cwd string for a project scope. */
  scope: string | null;
  skills: Skill[];
  /** agentId → display name, for the per-card agent chip. */
  agentNames: Record<string, string>;
  query: string;
  /** Render the standing uppercase label above the cards. True for the
   * user-scope group; false for project groups (the pill-nav already names the
   * project, so a second label would be redundant). */
  showLabel?: boolean;
  onSelect?: (skill: Skill) => void;
}

function ScopeGroup({ scope, skills, agentNames, query, showLabel = true, onSelect }: ScopeGroupProps) {
  const { t } = useI18n();

  const visible = useMemo(() => {
    const filtered = skills.filter((s) => matchesQuery(s, query));
    // Sort by name; ties broken by agent so the same skill from two agents
    // lands in a stable, scannable order.
    filtered.sort((a, b) => {
      const c = a.name.localeCompare(b.name);
      return c !== 0 ? c : (a.agentId ?? '').localeCompare(b.agentId ?? '');
    });
    return filtered;
  }, [skills, query]);

  const isUser = scope === null;
  const label = isUser ? t('skillView.userScope') : cwdLabel(scope!);
  const ariaLabel = isUser
    ? t('skillView.userScopeAriaLabel')
    : t('skillView.projectScopeAriaLabel', { cwd: scope! });

  return (
    <div className={styles.acpSkillViewScopeGroup} role="group" aria-label={ariaLabel}>
      {showLabel && (
        <div className={styles.acpSkillViewScopeLabel} title={isUser ? undefined : scope!}>
          {label}
        </div>
      )}
      {visible.length === 0 ? (
        <div className={styles.acpSkillViewScopeEmpty}>
          {query ? t('skillView.noMatch') : t('skillView.empty')}
        </div>
      ) : (
        <div className={styles.acpSkillViewScopeCards}>
          {visible.map((skill) => (
            <SkillCard
              key={`${skill.agentId ?? ''}:${skill.id}`}
              skill={skill}
              agentName={skill.agentId ? agentNames[skill.agentId] : undefined}
              onSelect={onSelect}
              hideCwd
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScopeNav — pill nav for switching between project scopes. The user scope is
// rendered as a standing group above (not a pill); each pill names a project
// cwd by its basename (full path on hover via `title`). Selecting a pill shows
// only that project's skills below.
// ---------------------------------------------------------------------------

interface ScopeNavProps {
  projectScopes: string[];
  selected: string | null;
  onSelectScope: (cwd: string) => void;
}

const ScopeNav = React.memo(function ScopeNav({
  projectScopes,
  selected,
  onSelectScope,
}: ScopeNavProps) {
  return (
    <div className={styles.acpSkillViewScopeNav} role="tablist">
      {projectScopes.map((cwd) => {
        const active = cwd === selected;
        return (
          <button
            key={cwd}
            type="button"
            role="tab"
            aria-selected={active}
            className={`${styles.acpSkillViewScopePill}${active ? ` ${styles.acpSkillViewScopePillActive}` : ''}`}
            title={cwd}
            onClick={() => onSelectScope(cwd)}
          >
            {cwdLabel(cwd)}
          </button>
        );
      })}
    </div>
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
  const { getClient } = useAcpContext();
  const agents = useAcpStore((s) => s.agents);
  // All currently-open workspace cwds — forwarded to the agent's
  // `_acp/skills/list` so it can scope the skills it reports to the open roots.
  // `useShallow` returns a stable array reference across renders as long as the
  // shallow-equal contents are unchanged (a new array each render would make
  // `useSyncExternalStore` loop forever — "getSnapshot should be cached").
  const workspaces = useAcpStore(
    useShallow((s) => Array.from(s.workspaces.values())),
  );
  const cwds = useMemo(() => workspaces.map((w) => w.cwd), [workspaces]);
  const [query, setQuery] = useState('');

  const { agentSkills, setAgentSkills } = useSkills();

  // Connected agents — the ones we can call `listSkills()` on. Stable list by
  // id+status so the fetch effect re-runs only when the connected set changes.
  const connectedAgents = useMemo(() => {
    const list = Array.from(agents.values()).filter((a) => a.status === 'connected');
    return list.map((a) => ({ id: a.id, name: a.agentInfo?.title || a.name }));
  }, [agents]);

  const connectedKey = useMemo(
    () => connectedAgents.map((a) => `${a.id}:${a.name}`).join('|'),
    [connectedAgents],
  );

  // Stable string key for the open-workspace set, so the fetch effect re-runs
  // (and re-scopes skills) when the user opens or closes a workspace.
  const cwdsKey = useMemo(() => cwds.join('|'), [cwds]);

  // Per-agent load/error status, kept in local state (transient UI affordance;
  // the catalog itself lives in the store).
  const [statusByAgent, setStatusByAgent] = useState<
    Record<string, { loading: boolean; error: boolean }>
  >({});

  // Fetch the latest skills from every connected agent on mount, whenever the
  // connected-agent set changes, and whenever the open-workspace set changes
  // (so skills get re-scoped when the user opens/closes a workspace). One
  // `listSkills()` per agent; results are written to `skillStore` via
  // `setAgentSkills`. `Promise.allSettled` so one agent's failure does not
  // block the others.
  useEffect(() => {
    if (connectedAgents.length === 0) return;

    // Mark every connected agent as loading up-front.
    setStatusByAgent((prev) => {
      const next: Record<string, { loading: boolean; error: boolean }> = {};
      for (const a of connectedAgents) {
        next[a.id] = { loading: true, error: false };
      }
      return { ...prev, ...next };
    });

    // Snapshot the open-workspace cwd list for this fetch. `cwds` is a derived
    // array (new reference per store change); its content is captured by
    // `cwdsKey`, the effect dep below — so we read `cwds` inside the effect
    // but only re-run on `cwdsKey`.
    const openCwds = cwds;
    let cancelled = false;
    Promise.allSettled(
      connectedAgents.map(async (a) => {
        const client = getClient(a.id);
        if (!client) throw new Error(`No client for agent ${a.id}`);
        const skills = await client.listSkills(openCwds);
        return { agentId: a.id, skills };
      }),
    ).then((results) => {
      if (cancelled) return;
      // Commit each successful fetch to the store, then reconcile load/error
      // flags per agent (a rejected agent stays errored; the rest clear).
      results.forEach((r) => {
        if (r.status === 'fulfilled') {
          setAgentSkills(r.value.agentId, r.value.skills);
        } else if (r.reason instanceof Error) {
          console.error(`Failed to load skills for an agent:`, r.reason);
        }
      });
      setStatusByAgent(() => {
        const next: Record<string, { loading: boolean; error: boolean }> = {};
        results.forEach((r, i) => {
          next[connectedAgents[i].id] = {
            loading: false,
            error: r.status === 'rejected',
          };
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
    // Re-run when the connected-agent set or the open-workspace set changes.
    // `getClient` is stable (useAcpProvider memoizes it); `setAgentSkills` is a
    // useCallback. `cwds` is read inside the effect but its content is captured
    // by `cwdsKey`, so we depend on the stable key (not the array reference,
    // which changes every store read).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedKey, cwdsKey]);

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
    [],
  );

  // agentId → display name, for the per-card agent chip. Connected agents
  // contribute their live name; cached (now-disconnected) catalog entries fall
  // back to their agentId so the chip still labels something.
  const agentNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of connectedAgents) map[a.id] = a.name;
    for (const g of agentSkills) if (!(g.agentId in map)) map[g.agentId] = g.agentId;
    return map;
  }, [connectedAgents, agentSkills]);

  // Flatten every agent's catalog into one list, then bucket by `cwd ?? null`.
  // Split into a user scope (cwd == null) and a list of project scopes in
  // stable first-seen order (Map preserves insertion order).
  const { userSkills, projectScopes } = useMemo(() => {
    const buckets = new Map<string | null, Skill[]>();
    for (const g of agentSkills) {
      for (const s of g.skills) {
        const key = s.cwd ?? null;
        const list = buckets.get(key);
        if (list) list.push(s);
        else buckets.set(key, [s]);
      }
    }
    const userSkills = buckets.get(null) ?? [];
    const projectScopes: { cwd: string; skills: Skill[] }[] = [];
    for (const [scope, scopedSkills] of buckets) {
      if (scope === null) continue;
      projectScopes.push({ cwd: scope, skills: scopedSkills });
    }
    return { userSkills, projectScopes };
  }, [agentSkills]);

  // Currently-selected project scope (cwd). Falls back to the first project
  // scope when the prior selection disappears (workspace closed) or when a
  // fresh one appears and nothing is selected yet.
  const [selectedScopeCwd, setSelectedScopeCwd] = useState<string | null>(null);
  const effectiveScopeCwd = useMemo(() => {
    if (projectScopes.length === 0) return null;
    if (selectedScopeCwd && projectScopes.some((p) => p.cwd === selectedScopeCwd)) {
      return selectedScopeCwd;
    }
    return projectScopes[0].cwd;
  }, [projectScopes, selectedScopeCwd]);

  const selectedProject = effectiveScopeCwd
    ? projectScopes.find((p) => p.cwd === effectiveScopeCwd)
    : undefined;

  // Any agent still loading (no catalog committed yet) → show a global loading
  // line under the scopes rather than per-agent headers.
  const anyLoading = connectedAgents.some(
    (a) => statusByAgent[a.id]?.loading || (!agentSkills.some((g) => g.agentId === a.id) && !statusByAgent[a.id]?.error),
  );
  const anyError = connectedAgents.some((a) => statusByAgent[a.id]?.error);

  // The global empty state fires only when there are no agents and no cached
  // skills at all — otherwise scope groups (or a loading/error line) render.
  const hasAnySource = connectedAgents.length > 0 || agentSkills.length > 0;

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
        {hasAnySource ? (
          <>
            {anyError && (
              <div className={styles.acpSkillViewScopeEmpty}>{t('skillView.loadError')}</div>
            )}

            {userSkills.length > 0 && (
              <ScopeGroup
                scope={null}
                skills={userSkills}
                agentNames={agentNames}
                query={query}
                onSelect={onSelect}
              />
            )}

            {projectScopes.length > 0 && (
              <>
                <ScopeNav
                  projectScopes={projectScopes.map((p) => p.cwd)}
                  selected={effectiveScopeCwd}
                  onSelectScope={setSelectedScopeCwd}
                />
                {selectedProject && (
                  <ScopeGroup
                    key={selectedProject.cwd}
                    scope={selectedProject.cwd}
                    skills={selectedProject.skills}
                    agentNames={agentNames}
                    query={query}
                    showLabel={false}
                    onSelect={onSelect}
                  />
                )}
              </>
            )}

            {anyLoading && userSkills.length === 0 && projectScopes.length === 0 && (
              <div className={styles.acpSkillViewScopeEmpty}>{t('skillView.loading')}</div>
            )}
          </>
        ) : (
          <div className={styles.acpSkillViewEmpty}>
            {emptyText ?? t('skillView.empty')}
          </div>
        )}
      </div>
    </div>
  );
}
