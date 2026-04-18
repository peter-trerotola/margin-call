import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import highlightjs from 'markdown-it-highlightjs';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

// Register a no-op language so highlight.js doesn't warn about mermaid blocks.
// These blocks are handled by our mermaid renderer after markdown rendering.
hljs.registerLanguage('mermaid', () => ({
  name: 'mermaid',
  contains: [],
}));

export interface LineRange {
  element: Element;
  startLine: number;
  endLine: number;
}

/**
 * Custom markdown-it plugin that adds `data-source-line` and `data-source-line-end`
 * attributes to block-level HTML elements.
 *
 * markdown-it block tokens already have a `.map` property containing [startLine, endLine].
 * This plugin copies those values to HTML attributes so they're accessible in the DOM.
 */
function sourceMapPlugin(md: MarkdownIt): void {
  // Token types that use renderToken (opening tags)
  const openTokenTypes = [
    'paragraph_open',
    'heading_open',
    'blockquote_open',
    'bullet_list_open',
    'ordered_list_open',
    'list_item_open',
    'table_open',
  ];

  for (const type of openTokenTypes) {
    const original = md.renderer.rules[type];

    md.renderer.rules[type] = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token.map) {
        token.attrSet('data-source-line', String(token.map[0]));
        token.attrSet('data-source-line-end', String(token.map[1]));
      }
      if (original) {
        return original(tokens, idx, options, env, self);
      }
      return self.renderToken(tokens, idx, options);
    };
  }

  // Self-closing tokens
  const selfClosingTypes = ['hr'];
  for (const type of selfClosingTypes) {
    const original = md.renderer.rules[type];

    md.renderer.rules[type] = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token.map) {
        token.attrSet('data-source-line', String(token.map[0]));
        token.attrSet('data-source-line-end', String(token.map[1]));
      }
      if (original) {
        return original(tokens, idx, options, env, self);
      }
      return self.renderToken(tokens, idx, options);
    };
  }

  // fence and code_block render HTML directly — inject data attributes into the output
  const originalFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const rendered = originalFence
      ? originalFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    if (token.map) {
      const attrs = ` data-source-line="${token.map[0]}" data-source-line-end="${token.map[1]}"`;
      return rendered.replace(/^<pre/, `<pre${attrs}`);
    }
    return rendered;
  };

  const originalCodeBlock = md.renderer.rules.code_block;
  md.renderer.rules.code_block = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const rendered = originalCodeBlock
      ? originalCodeBlock(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    if (token.map) {
      const attrs = ` data-source-line="${token.map[0]}" data-source-line-end="${token.map[1]}"`;
      return rendered.replace(/^<pre/, `<pre${attrs}`);
    }
    return rendered;
  };

  // html_block renders the raw HTML — wrap it in a div with source line attributes
  const originalHtmlBlock = md.renderer.rules.html_block;
  md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const rendered = originalHtmlBlock
      ? originalHtmlBlock(tokens, idx, options, env, self)
      : token.content;
    if (token.map) {
      return `<div data-source-line="${token.map[0]}" data-source-line-end="${token.map[1]}">${rendered}</div>`;
    }
    return rendered;
  };
}

/** Create a configured markdown-it instance with source mapping. */
export function createRenderer(): MarkdownIt {
  const md = new MarkdownIt({
    // Raw HTML in markdown IS passed through, but output is sanitized with
    // DOMPurify in renderMarkdown() before insertion. See security note there.
    html: true,
    linkify: true,
    typographer: true,
  });
  md.use(sourceMapPlugin);
  md.use(taskLists, { enabled: true, label: true });
  md.use(highlightjs, { inline: true, hljs });
  return md;
}

/**
 * Render markdown source to sanitized HTML with source line annotations.
 *
 * SECURITY: The markdown being rendered comes from PR files — i.e., untrusted
 * user content. A malicious PR author could embed `<script>` or event handlers.
 * Since the rendered HTML is set via innerHTML in the extension's
 * chrome-extension:// origin (which has access to chrome.storage.local and the
 * user's OAuth token), unsanitized HTML would be a token theft vector.
 *
 * DOMPurify strips <script>, javascript: URLs, and event-handler attributes
 * while preserving safe HTML tags (kbd, details, summary, etc.) and our own
 * data-source-line / data-source-line-end attributes.
 */
export function renderMarkdown(source: string): string {
  const md = createRenderer();
  const rawHtml = md.render(source);
  return DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ['input'],
    ADD_ATTR: [
      'data-source-line', 'data-source-line-end', 'target',
      'checked', 'disabled', 'type', 'class',
    ],
  });
}

/**
 * Build a line-range map from the rendered DOM.
 *
 * Walks all elements with `data-source-line` in document order and
 * returns an array of { element, startLine, endLine } objects.
 *
 * Uses `data-source-line-end` when available, otherwise falls back
 * to computing from the next sibling's `data-source-line - 1`.
 */
export function buildLineRangeMap(container: Element): LineRange[] {
  const elements = container.querySelectorAll('[data-source-line]');
  const ranges: LineRange[] = [];

  for (const el of elements) {
    const startLine = parseInt(el.getAttribute('data-source-line')!, 10);
    const endLineAttr = el.getAttribute('data-source-line-end');
    const endLine = endLineAttr
      ? parseInt(endLineAttr, 10) - 1 // map[1] is exclusive
      : startLine;

    ranges.push({ element: el, startLine, endLine });
  }

  return ranges;
}

/**
 * Walk a line-range map and add CSS classes to elements based on diff state:
 *   - `mc-has-additions`: any source line in the element was added in this PR
 *   - `mc-commentable`: any source line in the element is commentable
 *     (added OR context appearing in the diff)
 *
 * Source-line indexes from the renderer are 0-indexed; diff line sets are
 * 1-indexed (GitHub API convention). This function bridges them.
 */
export function markDiffState(
  ranges: LineRange[],
  addedLines: Set<number>,
  commentableLines: Set<number>
): void {
  for (const range of ranges) {
    const start = range.startLine + 1; // 0→1-indexed
    const end = range.endLine + 1;
    let hasAdded = false;
    let hasCommentable = false;
    for (let l = start; l <= end; l++) {
      if (addedLines.has(l)) hasAdded = true;
      if (commentableLines.has(l)) hasCommentable = true;
      if (hasAdded && hasCommentable) break;
    }
    if (hasAdded) range.element.classList.add('mc-has-additions');
    if (hasCommentable) range.element.classList.add('mc-commentable');
  }
}
