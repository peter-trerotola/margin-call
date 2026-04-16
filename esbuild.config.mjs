import * as esbuild from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

const outdir = 'dist';

// Ensure dist directories exist
mkdirSync(`${outdir}/panel`, { recursive: true });
mkdirSync(`${outdir}/popup`, { recursive: true });
mkdirSync(`${outdir}/icons`, { recursive: true });

// Bundle background service worker
await esbuild.build({
  entryPoints: ['src/background/index.ts'],
  bundle: true,
  outfile: `${outdir}/background.js`,
  format: 'esm',
  target: 'es2022',
  minify: true,
});

// Bundle content script
await esbuild.build({
  entryPoints: ['src/content/index.ts'],
  bundle: true,
  outfile: `${outdir}/content.js`,
  format: 'iife',
  target: 'es2022',
  minify: true,
});

// Bundle panel page JS
await esbuild.build({
  entryPoints: ['src/panel/index.ts'],
  bundle: true,
  outfile: `${outdir}/panel/panel.js`,
  format: 'esm',
  target: 'es2022',
  minify: true,
});

// Bundle popup JS
await esbuild.build({
  entryPoints: ['src/popup/index.ts'],
  bundle: true,
  outfile: `${outdir}/popup/popup.js`,
  format: 'esm',
  target: 'es2022',
  minify: true,
});

// Copy static assets
copyFileSync('manifest.json', `${outdir}/manifest.json`);
copyFileSync('src/panel/index.html', `${outdir}/panel/index.html`);
copyFileSync('src/panel/styles.css', `${outdir}/panel/styles.css`);
copyFileSync('src/popup/index.html', `${outdir}/popup/index.html`);
copyFileSync('src/popup/styles.css', `${outdir}/popup/styles.css`);
copyFileSync('src/content/styles.css', `${outdir}/content.css`);

// Copy github-markdown-css — the bare `github-markdown.css` auto-switches
// between light and dark based on prefers-color-scheme.
const ghCssPath = 'node_modules/github-markdown-css/github-markdown.css';
if (existsSync(ghCssPath)) {
  copyFileSync(ghCssPath, `${outdir}/panel/github-markdown.css`);
}

// Copy icons
if (existsSync('icons')) {
  cpSync('icons', `${outdir}/icons`, { recursive: true });
}

console.log('Build complete → dist/');
