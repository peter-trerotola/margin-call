import * as esbuild from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, existsSync } from 'fs';

// Parse --target arg: chrome | firefox | all (default: all)
const targetArg = process.argv.find((a) => a.startsWith('--target='));
const target = targetArg ? targetArg.split('=')[1] : 'all';
const targets = target === 'all' ? ['chrome', 'firefox'] : [target];

async function buildTarget(browserTarget) {
  const outdir = `dist/${browserTarget}`;

  // Ensure output directories exist
  mkdirSync(`${outdir}/panel`, { recursive: true });
  mkdirSync(`${outdir}/popup`, { recursive: true });
  mkdirSync(`${outdir}/icons`, { recursive: true });

  // Bundle background service worker / script
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

  // Copy the browser-specific manifest
  const manifestSrc = `manifest.${browserTarget}.json`;
  copyFileSync(manifestSrc, `${outdir}/manifest.json`);

  // Copy static assets
  copyFileSync('src/panel/index.html', `${outdir}/panel/index.html`);
  copyFileSync('src/panel/styles.css', `${outdir}/panel/styles.css`);
  copyFileSync('src/popup/index.html', `${outdir}/popup/index.html`);
  copyFileSync('src/popup/styles.css', `${outdir}/popup/styles.css`);
  copyFileSync('src/content/styles.css', `${outdir}/content.css`);

  // Copy github-markdown-css
  const ghCssPath = 'node_modules/github-markdown-css/github-markdown.css';
  if (existsSync(ghCssPath)) {
    copyFileSync(ghCssPath, `${outdir}/panel/github-markdown.css`);
  }

  // Copy highlight.js theme
  const hljsCssPath = 'node_modules/highlight.js/styles/github-dark.min.css';
  if (existsSync(hljsCssPath)) {
    copyFileSync(hljsCssPath, `${outdir}/panel/hljs.css`);
  }

  // Copy icons (PNGs only)
  if (existsSync('icons')) {
    cpSync('icons', `${outdir}/icons`, {
      recursive: true,
      filter: (src) => !src.endsWith('.svg'),
    });
  }

  console.log(`Build complete: ${outdir}/`);
}

for (const t of targets) {
  await buildTarget(t);
}
