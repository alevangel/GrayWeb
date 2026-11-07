// Builds the extension packages.
//
//   node scripts/build.mjs --target=chromium|firefox|all [--watch] [--zip]
//
// Output: dist/<target>/ (unpacked extension) and, with --zip, dist/grayweb-<target>-<version>.zip
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? true];
  }),
);
const TARGETS = ['chromium', 'firefox'];
const targets = args.target === 'all' || args.target === undefined ? TARGETS : [args.target];
for (const target of targets) {
  if (!TARGETS.includes(target)) throw new Error(`Unknown target: ${target}`);
}

const FIREFOX_ID = 'grayweb@alevangel.github.io';

function manifest(target) {
  const base = {
    manifest_version: 3,
    name: '__MSG_extName__',
    short_name: 'GrayWeb',
    description: '__MSG_extDescription__',
    version: pkg.version,
    default_locale: 'en',
    homepage_url: 'https://github.com/alevangel/GrayWeb',
    icons: {
      16: 'icons/on-16.png',
      32: 'icons/on-32.png',
      48: 'icons/on-48.png',
      128: 'icons/on-128.png',
    },
    permissions: ['storage'],
    host_permissions: ['<all_urls>'],
    action: {
      default_popup: 'popup.html',
      default_title: '__MSG_extName__',
      default_icon: { 16: 'icons/off-16.png', 32: 'icons/off-32.png', 48: 'icons/off-48.png' },
    },
    options_ui: { page: 'options.html', open_in_tab: true },
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content.js'],
        run_at: 'document_start',
        all_frames: true,
      },
    ],
    commands: {
      'toggle-site': {
        suggested_key: { default: 'Alt+Shift+G' },
        description: '__MSG_commandToggleSite__',
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'",
    },
  };

  if (target === 'chromium') {
    return {
      ...base,
      minimum_chrome_version: '120',
      background: { service_worker: 'background.js' },
    };
  }
  return {
    ...base,
    background: { scripts: ['background.js'] },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ID,
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
      // Not tested on Android yet. The key keeps the manifest valid for Firefox for Android.
      gecko_android: { strict_min_version: '142.0' },
    },
  };
}

const ENTRIES = {
  background: 'src/background/index.ts',
  content: 'src/content/index.ts',
  popup: 'src/popup/index.ts',
  options: 'src/options/index.ts',
  'regex-worker': 'src/worker/regex-worker.ts',
  'popup-style': 'src/popup/popup.css',
  'options-style': 'src/options/options.css',
};

function copyStatic(outDir, target) {
  cpSync(join(ROOT, 'static'), outDir, { recursive: true });
  cpSync(join(ROOT, 'src/popup/popup.html'), join(outDir, 'popup.html'));
  cpSync(join(ROOT, 'src/options/options.html'), join(outDir, 'options.html'));
  cpSync(join(ROOT, 'LICENSE'), join(outDir, 'LICENSE'));
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest(target), null, 2)}\n`);
}

async function build(target) {
  const outDir = join(ROOT, 'dist', target);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const options = {
    absWorkingDir: ROOT,
    entryPoints: ENTRIES,
    outdir: outDir,
    bundle: true,
    format: 'iife',
    target: target === 'firefox' ? ['firefox140'] : ['chrome120'],
    minify: !args.watch,
    sourcemap: args.watch ? 'inline' : false,
    legalComments: 'none',
    logLevel: 'warning',
    define: { 'process.env.TARGET': JSON.stringify(target) },
  };

  if (args.watch) {
    const context = await esbuild.context({
      ...options,
      plugins: [{ name: 'static', setup: (b) => b.onEnd(() => copyStatic(outDir, target)) }],
    });
    await context.watch();
    console.log(`Watching ${target}…`);
    return;
  }

  await esbuild.build(options);
  copyStatic(outDir, target);
  console.log(`Built dist/${target}`);

  if (args.zip) {
    const file = join(ROOT, 'dist', `grayweb-${target}-${pkg.version}.zip`);
    rmSync(file, { force: true });
    execFileSync('zip', ['-qr', file, '.'], { cwd: outDir });
    console.log(`Packed ${file}`);
  }
}

for (const target of targets) await build(target);
