declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  const plugin: MarkdownIt.PluginWithOptions<{
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }>;
  export default plugin;
}

declare module 'markdown-it-highlightjs' {
  import type MarkdownIt from 'markdown-it';
  const plugin: MarkdownIt.PluginWithOptions<{
    inline?: boolean;
    hljs?: unknown;
    ignoreIllegals?: boolean;
  }>;
  export default plugin;
}
