# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Grayscale filter applied before the first paint, in all frames, with updates for single-page applications.
- Rules with eight match types: domain, host, URL prefix, exact URL, wildcard, regular expression, contains text and path.
- Gray and exception rules, ordered by priority, with optional schedules.
- Two modes: only listed sites, or all sites except exceptions.
- Global intensity, contrast and brightness, with per-rule overrides and presets.
- Popup to add or remove the current site, adjust its intensity and pause GrayWeb.
- Keyboard shortcut to toggle the current site.
- Settings page with rule editor, URL tester, search, drag-and-drop ordering and undo.
- Import, export, reset and synchronization with the browser account.
- English and Italian translations.
- Packages for Chromium and Firefox.
