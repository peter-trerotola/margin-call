import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock the mermaid module before importing the unit under test
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string, source: string) => ({
      svg: `<svg data-mermaid-id="${id}" data-source-len="${source.length}"></svg>`,
    })),
  },
}));

import { renderMermaidBlocks } from '../../src/panel/mermaid.js';

function setupContainer(html: string) {
  const dom = new JSDOM(`<!DOCTYPE html><div id="root">${html}</div>`);
  return dom.window.document.getElementById('root')!;
}

describe('renderMermaidBlocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 when no mermaid blocks are present', async () => {
    const container = setupContainer(
      '<pre><code class="language-js">console.log(1);</code></pre>'
    );
    const count = await renderMermaidBlocks(container);
    expect(count).toBe(0);
  });

  it('replaces a mermaid code block with a rendered SVG', async () => {
    const container = setupContainer(
      '<pre data-source-line="2" data-source-line-end="6">' +
        '<code class="language-mermaid">graph TD; A-->B</code>' +
        '</pre>'
    );

    const count = await renderMermaidBlocks(container);
    expect(count).toBe(1);

    // Original <pre> is gone
    expect(container.querySelector('pre')).toBeNull();

    // Replaced with a wrapper containing the SVG
    const wrapper = container.querySelector('.mermaid-diagram');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.querySelector('svg')).not.toBeNull();
  });

  it('preserves data-source-line attributes from the source <pre>', async () => {
    const container = setupContainer(
      '<pre data-source-line="10" data-source-line-end="15">' +
        '<code class="language-mermaid">flowchart LR; X-->Y</code>' +
        '</pre>'
    );

    await renderMermaidBlocks(container);

    const wrapper = container.querySelector('.mermaid-diagram');
    expect(wrapper!.getAttribute('data-source-line')).toBe('10');
    expect(wrapper!.getAttribute('data-source-line-end')).toBe('15');
  });

  it('preserves diff state classes from the source <pre>', async () => {
    const container = setupContainer(
      '<pre class="mc-has-additions mc-commentable" data-source-line="0" data-source-line-end="3">' +
        '<code class="language-mermaid">sequenceDiagram</code>' +
        '</pre>'
    );

    await renderMermaidBlocks(container);

    const wrapper = container.querySelector('.mermaid-diagram')!;
    expect(wrapper.classList.contains('mc-has-additions')).toBe(true);
    expect(wrapper.classList.contains('mc-commentable')).toBe(true);
  });

  it('renders multiple diagrams in one document', async () => {
    const container = setupContainer(
      '<pre><code class="language-mermaid">graph A</code></pre>' +
        '<p>Between</p>' +
        '<pre><code class="language-mermaid">graph B</code></pre>'
    );

    const count = await renderMermaidBlocks(container);
    expect(count).toBe(2);
    expect(container.querySelectorAll('.mermaid-diagram').length).toBe(2);
  });

  it('shows an error UI when mermaid.render throws', async () => {
    const mermaid = (await import('mermaid')).default;
    (mermaid.render as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Parse error: invalid syntax')
    );

    const container = setupContainer(
      '<pre><code class="language-mermaid">not valid mermaid</code></pre>'
    );

    await renderMermaidBlocks(container);

    const errorEl = container.querySelector('.mermaid-error');
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toContain('Mermaid render failed');
    expect(errorEl!.textContent).toContain('Parse error: invalid syntax');
    // Source is preserved in a <details> for inspection
    expect(errorEl!.querySelector('details')).not.toBeNull();
    expect(errorEl!.querySelector('details pre')!.textContent).toBe(
      'not valid mermaid'
    );
  });

  it('ignores non-mermaid code blocks', async () => {
    const container = setupContainer(
      '<pre><code class="language-mermaid">graph TD</code></pre>' +
        '<pre><code class="language-bash">echo hi</code></pre>'
    );

    const count = await renderMermaidBlocks(container);
    expect(count).toBe(1);
    // Bash block should be untouched
    expect(container.querySelectorAll('pre').length).toBe(1);
  });
});
