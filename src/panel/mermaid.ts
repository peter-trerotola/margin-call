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
      wrapper.innerHTML = svg;
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
