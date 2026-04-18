/**
 * Mermaid diagram rendering for the rendered markdown panel.
 *
 * Markdown-it renders fenced ```mermaid blocks as <pre><code class="language-mermaid">…</code></pre>
 * (which DOMPurify allows through). After the sanitized HTML is inserted
 * into the DOM, we walk the container, find those code blocks, run Mermaid
 * on the source, and replace each block with the rendered SVG. Source-line
 * annotations on the original <pre> are preserved on the SVG wrapper so
 * commenting on a diagram works the same as commenting on any other block.
 */
import mermaid from 'mermaid';

let initialized = false;

/** Pick the Mermaid theme based on the user's system color-scheme preference. */
export function preferredMermaidTheme(): 'default' | 'dark' {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'default';
}

function ensureInitialized(): void {
  if (initialized) return;
  mermaid.initialize({
    // We invoke render() ourselves; let it stay quiet on its own.
    startOnLoad: false,
    // securityLevel 'strict' forbids HTML/script in diagrams (safer for
    // user-supplied content from a PR).
    securityLevel: 'strict',
    theme: preferredMermaidTheme(),
  });
  initialized = true;
}

let renderCounter = 0;

/**
 * Find every Mermaid code block in `container` and render it to an SVG.
 * Returns the number of diagrams rendered.
 */
export async function renderMermaidBlocks(
  container: Element
): Promise<number> {
  const codeBlocks = container.querySelectorAll<HTMLElement>(
    'pre > code.language-mermaid'
  );
  if (codeBlocks.length === 0) return 0;

  ensureInitialized();

  let rendered = 0;
  for (const codeEl of codeBlocks) {
    const pre = codeEl.parentElement;
    if (!pre || pre.tagName !== 'PRE') continue;

    const source = codeEl.textContent ?? '';
    const id = `margin-call-mermaid-${++renderCounter}`;

    // Preserve source-line annotations from the <pre> for commenting.
    const sourceLine = pre.getAttribute('data-source-line');
    const sourceLineEnd = pre.getAttribute('data-source-line-end');
    const inheritedClasses = ['mc-has-additions', 'mc-commentable'].filter(
      (c) => pre.classList.contains(c)
    );

    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-diagram';
    if (sourceLine) wrapper.setAttribute('data-source-line', sourceLine);
    if (sourceLineEnd)
      wrapper.setAttribute('data-source-line-end', sourceLineEnd);
    for (const cls of inheritedClasses) wrapper.classList.add(cls);

    try {
      const { svg } = await mermaid.render(id, source);

      // Toolbar with zoom/pan controls (similar to GitHub's Mermaid preview)
      const toolbar = document.createElement('div');
      toolbar.className = 'mermaid-toolbar';

      const zoomInBtn = document.createElement('button');
      zoomInBtn.type = 'button';
      zoomInBtn.textContent = '+';
      zoomInBtn.title = 'Zoom in';

      const zoomOutBtn = document.createElement('button');
      zoomOutBtn.type = 'button';
      zoomOutBtn.textContent = '-';
      zoomOutBtn.title = 'Zoom out';

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.textContent = 'Reset';
      resetBtn.title = 'Reset zoom';

      const fullscreenBtn = document.createElement('button');
      fullscreenBtn.type = 'button';
      fullscreenBtn.textContent = 'Fullscreen';
      fullscreenBtn.title = 'Toggle fullscreen';

      toolbar.append(zoomOutBtn, zoomInBtn, resetBtn, fullscreenBtn);

      const svgContainer = document.createElement('div');
      svgContainer.className = 'mermaid-svg-container';
      svgContainer.innerHTML = svg;

      let scale = 1;
      const applyZoom = () => {
        svgContainer.style.transform = `scale(${scale})`;
        svgContainer.style.transformOrigin = 'center top';
      };

      zoomInBtn.addEventListener('click', () => { scale = Math.min(scale + 0.25, 3); applyZoom(); });
      zoomOutBtn.addEventListener('click', () => { scale = Math.max(scale - 0.25, 0.25); applyZoom(); });
      resetBtn.addEventListener('click', () => { scale = 1; applyZoom(); });
      fullscreenBtn.addEventListener('click', () => {
        openLightbox(svg);
      });

      wrapper.append(toolbar, svgContainer);
    } catch (err) {
      // Surface the error inline rather than crashing the whole panel.
      wrapper.classList.add('mermaid-error');
      const message = (err as Error)?.message ?? String(err);
      wrapper.innerHTML =
        `<div class="mermaid-error-header">Mermaid render failed</div>` +
        `<pre class="mermaid-error-body"></pre>` +
        `<details><summary>Source</summary><pre></pre></details>`;
      const body = wrapper.querySelector(
        '.mermaid-error-body'
      ) as HTMLPreElement;
      body.textContent = message;
      const sourcePre = wrapper.querySelector(
        'details > pre'
      ) as HTMLPreElement;
      sourcePre.textContent = source;
    }

    pre.replaceWith(wrapper);
    rendered++;
  }

  return rendered;
}

/**
 * Open a Mermaid SVG in a fullscreen lightbox overlay with its own
 * zoom/pan controls and an Escape-to-close handler.
 */
function openLightbox(svg: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'mermaid-lightbox';

  const topBar = document.createElement('div');
  topBar.className = 'mermaid-lightbox-topbar';

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.type = 'button';
  zoomOutBtn.textContent = '-';
  zoomOutBtn.title = 'Zoom out';

  const zoomInBtn = document.createElement('button');
  zoomInBtn.type = 'button';
  zoomInBtn.textContent = '+';
  zoomInBtn.title = 'Zoom in';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = 'Reset';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.className = 'mermaid-lightbox-close';

  topBar.append(zoomOutBtn, zoomInBtn, resetBtn, closeBtn);

  const svgContainer = document.createElement('div');
  svgContainer.className = 'mermaid-lightbox-body';
  svgContainer.innerHTML = svg;

  overlay.append(topBar, svgContainer);
  document.body.appendChild(overlay);

  let scale = 1;
  const applyZoom = () => {
    const svgEl = svgContainer.querySelector('svg');
    if (svgEl) {
      svgEl.style.transform = `scale(${scale})`;
      svgEl.style.transformOrigin = 'center center';
    }
  };

  zoomInBtn.addEventListener('click', () => { scale = Math.min(scale + 0.25, 5); applyZoom(); });
  zoomOutBtn.addEventListener('click', () => { scale = Math.max(scale - 0.25, 0.1); applyZoom(); });
  resetBtn.addEventListener('click', () => { scale = 1; applyZoom(); });

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
}
