# Security policy

## Supported versions

Only the latest released version of GrayWeb receives security fixes.

## Report a vulnerability

Do not open a public issue for a security problem.

Use [GitHub private vulnerability reporting](https://github.com/alevangel/GrayWeb/security/advisories/new) and include:

- a description of the problem and its impact;
- the steps to reproduce it;
- the browser, its version and the GrayWeb version.

You will receive an answer within 7 days. When the problem is confirmed, a fix is released as soon as possible and you are credited in the release notes, if you want.

## Scope

GrayWeb runs a content script on every page and keeps user rules in the browser storage. Reports about these areas are especially welcome, for example:

- a page that can read or change the GrayWeb configuration;
- a rule or an imported file that can run code or block a page;
- a way to make GrayWeb send data out of the browser.
