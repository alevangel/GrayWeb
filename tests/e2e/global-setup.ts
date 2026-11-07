import { execFileSync } from 'node:child_process';

export default function globalSetup(): void {
  execFileSync('node', ['scripts/build.mjs', '--target=chromium'], { stdio: 'inherit' });
}
