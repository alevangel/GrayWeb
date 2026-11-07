# GrayWeb

GrayWeb is a browser extension that shows the websites you choose in grayscale.

Color is one of the strongest tools that websites use to hold your attention. A gray page is calmer and less attractive. GrayWeb lets you decide which sites lose their color, and how much.

- **Your sites, your rules.** Add the current site with one click, or write precise rules: domain, host, URL prefix, exact URL, wildcard, regular expression, text in the URL, or path.
- **Two modes.** Make only the listed sites gray, or make every site gray except your exceptions.
- **Adjustable filter.** Set intensity, contrast and brightness for all sites, and override them for a single rule. Save your favourite values as presets.
- **No flash of color.** The filter is in place before the page appears.
- **Pause when you need it.** Pause the current tab, or all sites for 15 minutes or one hour. Rules can also be active only on selected days and hours.
- **Private by design.** No data collection, no network requests, no remote code.
- **English and Italian.**

GrayWeb works in Chromium browsers (Chrome, Edge, Brave, Opera, Vivaldi) and in Firefox.

## Install

Store listings are not available yet. To install from source:

```sh
git clone https://github.com/alevangel/GrayWeb.git
cd GrayWeb
npm ci
npm run build
```

**Chromium:** open `chrome://extensions`, turn on _Developer mode_, select _Load unpacked_ and choose `dist/chromium`.

**Firefox:** open `about:debugging#/runtime/this-firefox`, select _Load Temporary Add-on_ and choose `dist/firefox/manifest.json`. Or run `npm run start:firefox`.

## How rules work

GrayWeb checks the rules from top to bottom. The first enabled rule that matches the URL decides:

- a **Gray** rule applies the filter;
- an **Exception** rule keeps the page in color.

When no rule matches, the mode decides: in _Only listed sites_ the page stays in color, in _All sites except exceptions_ it becomes gray.

| Type               | Pattern example                                 | Matches                                                        |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------- |
| Domain             | `example.com`                                   | `example.com` and every subdomain, but not `myexample.com`     |
| Host               | `www.example.com`                               | that host only                                                 |
| URL prefix         | `https://example.com/news`                      | every URL that starts with the pattern                         |
| Exact URL          | `https://example.com/page`                      | that page; query and fragment are ignored                      |
| Wildcard           | `*.example.*/video/*`                           | `*` is any text, `?` is one character; the full URL must match |
| Regular expression | `^https://(www\.)?example\.com/(watch\|shorts)` | JavaScript syntax, tested on the full URL                      |
| Contains text      | `casino`                                        | every URL that contains the text, in any case                  |
| Path               | `/admin`                                        | `/admin` and its subfolders on any site                        |

Domain and host names are compared without case, and international names are converted to Punycode. Patterns without a scheme match both `http` and `https`.

The settings page has a field to test any URL against your rules, and the rule editor shows which open tabs a pattern matches. Regular expressions are checked for slow patterns before you save them.

## Permissions

| Permission          | Why                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `storage`           | Keeps your rules and settings, and synchronizes them with your browser account.           |
| Access to all sites | Applies the filter before the page appears. GrayWeb never reads the content of the pages. |

See [PRIVACY.md](PRIVACY.md) for details.

## Development

Requirements: Node.js 20 or later.

| Command                 | What it does                                                                    |
| ----------------------- | ------------------------------------------------------------------------------- |
| `npm run build`         | Builds `dist/chromium` and `dist/firefox`                                       |
| `npm run watch`         | Rebuilds the Chromium package on every change                                   |
| `npm run watch:firefox` | Rebuilds the Firefox package on every change                                    |
| `npm run start:firefox` | Builds and opens Firefox with the extension                                     |
| `npm test`              | Runs the unit tests                                                             |
| `npm run test:e2e`      | Runs the end-to-end tests in Chromium (needs `npx playwright install chromium`) |
| `npm run lint`          | Lints the code                                                                  |
| `npm run lint:firefox`  | Validates the Firefox package with `web-ext`                                    |
| `npm run check`         | Lint, format check, type check, unit tests and build                            |
| `npm run package`       | Builds the ZIP files for the stores                                             |

### Project structure

```
src/
  background/   background worker: tab state, pauses, toolbar icon, sync, shortcut
  content/      content script: applies the filter to pages
  popup/        toolbar popup
  options/      settings page
  shared/       code without UI: rule engine, configuration, storage, translations
  ui/           shared UI components and base style
  worker/       web worker that tests regular expressions in isolation
static/         icons and translations (_locales)
scripts/        build and icon generation
tests/          unit tests (Vitest) and end-to-end tests (Playwright)
```

The rule engine in `src/shared/rules` has no browser dependency, so it is easy to test and reuse.

### Translations

Translations are in `static/_locales/<language>/messages.json`. To add a language, copy the English file, translate the `message` values, and add the language code to `SUPPORTED_LANGUAGES` in `src/shared/i18n.ts` and to the language list on the settings page. The tests check that every language has the same keys and placeholders as English.

## Roadmap

- Safari for macOS, iOS and iPadOS
- Firefox for Android
- Keep images and videos in color on a gray page
- Shareable rule lists

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you open a pull request.

## License

[MIT](LICENSE) © Alessandro Evangelista
