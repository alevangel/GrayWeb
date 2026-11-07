# Contributing to GrayWeb

Thank you for your interest in GrayWeb. This guide explains how to propose a change.

## Before you start

- For a bug, open an issue with the steps to reproduce it, the browser and its version.
- For a new feature, open an issue first, so we can agree on the approach before you write code.
- For a small fix (typo, translation, clear bug), a pull request without an issue is fine.

## Set up the project

```sh
npm ci
npm run build
npx playwright install chromium   # only for the end-to-end tests
```

Load `dist/chromium` or `dist/firefox` in your browser as described in the [README](README.md#install). `npm run watch` rebuilds the Chromium package on every change; reload the extension to see it.

## Branches

- `main` contains released versions only.
- `develop` is the integration branch. Open pull requests against `develop`.
- Name your branch after the change: `feat/rule-import`, `fix/frame-filter`, `docs/readme`.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(rules): add path match type
fix(content): restore the style when the page replaces the root element
docs: explain the permissions
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`.

## Before you open a pull request

```sh
npm run check
npm run test:e2e
```

- Add or update tests for every change in behavior. The rule engine must keep a coverage of 95 % or more.
- Put all interface text in `static/_locales/en/messages.json` and `static/_locales/it/messages.json`. Do not write interface text in the code.
- Keep the content script small: it runs on every page.
- Do not add network requests, analytics or remote code.
- Update `CHANGELOG.md` under _Unreleased_.

## Code style

TypeScript in strict mode, formatted with Prettier and checked with ESLint. `npm run format` fixes the format. Keep comments short and explain _why_, not _what_.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By taking part, you agree to respect it.
