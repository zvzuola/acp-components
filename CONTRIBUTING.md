# Contributing to acp-components

Thanks for helping make ACP client development easier. Bug fixes, new host integrations, component improvements, documentation, and focused examples are all welcome.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Open an issue before a large behavioral or public API change so the approach can be discussed.
- Keep `packages/core` framework-agnostic and free of React imports.
- Follow existing component, store, platform, and SCSS Module patterns.

## Local development

Requirements: Node.js 18 or later and pnpm.

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

Run the backend-free interactive demo with:

```bash
pnpm dev
```

The demo opens at `http://localhost:5173`. See the README for connecting it to a real ACP agent.

## Making changes

- Add or update co-located Vitest tests for behavior changes.
- Prefix intentionally unused variables, parameters, and caught errors with `_`.
- Use `--acp-*` design tokens in styles; do not hardcode colors.
- Keep public exports explicit in each package's `src/index.ts`.
- Update both `README.md` and `README_zh.md` when changing shared user-facing documentation.

## Pull requests

Keep each pull request focused. Describe what changed, why it changed, how it was tested, and include screenshots or a short recording for visible UI work. Use short, lowercase, imperative commit messages such as `add session view` or `fix http transport`.

By contributing, you agree that your contribution is licensed under the MIT License.
