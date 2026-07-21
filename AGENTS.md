# Repository Guidelines

A pnpm monorepo for Agent Client Protocol (ACP) React components and a framework-agnostic core.

## Project Structure & Module Organization

- `packages/core` (`@acp-components/core`): provider, `AcpClient`, vanilla Zustand stores (`acpStore`, `sessionStore`, `fileTreeStore`), transports (Stdio/Http/WebSocket/custom), actions, and shared types. Zero React dependency.
- `packages/react` (`@acp-components/react`): UI layer with `components/` (each component in its own subdirectory), `context/` (`AcpContext`, `PlatformContext`), `hooks/`, `i18n/`, and `styles/`.
- `examples/`: `demo` (Vite web app), `server` (WebSocket-to-stdio bridge), `tauri` (desktop shell).
- `assets/`, `design-system/`, `docs/`: shared resources and documentation.

Tests are co-located next to source as `*.test.ts` or `*.test.tsx`.

## Build, Test, and Development Commands

```bash
pnpm install              # install all workspace deps
pnpm build                # build core, then react
pnpm build:core           # build @acp-components/core only
pnpm build:react          # build @acp-components/react only
pnpm test                 # run vitest across both packages
pnpm lint                 # eslint packages/*/src/**/*.{ts,tsx}
pnpm dev                  # Vite demo at localhost:5173 (run pnpm dev:server first)
pnpm dev:server           # WebSocket -> stdio bridge on ACP_PORT (default 3100)
pnpm dev:tauri            # Tauri desktop dev
```

Run a single package or filter by test name:

```bash
pnpm --filter @acp-components/core test
pnpm --filter @acp-components/core test -- -t "pattern"
```

Each package also exposes `test:watch` for interactive vitest.

## Coding Style & Naming Conventions

- TypeScript strict mode; ES2022 target, ESNext modules, bundler resolution.
- ESLint flat config (`eslint.config.js`): typescript-eslint recommended plus react-hooks rules.
- Prefix unused vars, args, and caught errors with `_`.
- Styles: SCSS Modules with `camelCaseOnly` locals; theme via `data-acp-theme` (`"dark"` default, `"light"`).
- Use `--acp-*` CSS custom properties and never hardcode hex colors. Avoid inline styles unless the value is dynamic.
- React components live in `packages/react/src/components/<name>/`, one per directory.

## Testing Guidelines

- Framework: Vitest. React tests use `@testing-library/react` with jsdom.
- Co-locate tests as `<module>.test.ts(x)` next to the code under test.
- Use `describe`/`it`/`expect` from vitest; mock native APIs (`navigator.clipboard`, timers) in `beforeEach`/`afterEach`.
- Keep core tests free of React imports: core must stay framework-agnostic.

## Commit & Pull Request Guidelines

- Commit messages are lowercase, imperative, and short: `add session view`, `fix http transport`, `update readme`. No conventional-commit prefix.
- Open PRs against the default branch with a description of what changed and why; link any related issue.
- Ensure `pnpm lint` and `pnpm test` pass before requesting review. Add or update tests for any behavior change in `packages/core` or `packages/react`.
