import type { Parser } from 'prosemirror-highlight';
import { createParser } from 'prosemirror-highlight/shiki';
import { codeBlockOptions } from '@blocknote/code-block';

/**
 * Dual-theme shiki tokenization for code blocks.
 *
 * Why this exists: `block-editor.css` colors code tokens via
 * `color: var(--shiki-light, …)` / `.dark … var(--shiki-dark, …)` with
 * `!important` (so a light panel can never show light-on-light dark-theme
 * tokens). Those CSS variables only exist when shiki tokenizes with BOTH
 * themes (`themes: {light, dark}` + `defaultColor: false`) — but BlockNote's
 * `lazyShikiPlugin` builds its parser with NO options, so tokenization is
 * single-theme (`getLoadedThemes()[0]` = github-dark) and every span carries
 * a plain inline `color: #hex`. The `!important` rules then flatten every
 * token to the fallback — syntax highlighting renders MONOCHROME in both
 * modes (verified empirically: spans exist with per-token inline colors, but
 * one computed color).
 *
 * The fix: BlockNote caches its parser/highlighter on `Symbol.for(...)`
 * globals precisely so they can be shared across instances
 * (`lazyShikiPlugin`: `parser = globalThis[shikiParserSymbol] ||
 * createParser(highlighter)`). We pre-seed the PARSER symbol with a
 * dual-theme parser (github-light + github-dark are both already loaded by
 * `codeBlockOptions.createHighlighter`), reusing the same highlighter
 * promise symbol so only one highlighter ever exists. With
 * `defaultColor: false`, spans carry `--shiki-light`/`--shiki-dark` custom
 * properties instead of a fixed color — exactly what the CSS was written
 * for — and both modes render real syntax colors.
 *
 * `prosemirror-highlight` is the same (transitive, hoisted) package
 * BlockNote itself uses — the parser we create satisfies the exact `Parser`
 * contract `lazyShikiPlugin` consumes (returning a `Promise<void>` on the
 * first call is the documented "loading, re-decorate later" signal).
 */

const HIGHLIGHTER_PROMISE_SYMBOL = Symbol.for('blocknote.shikiHighlighterPromise');
const PARSER_SYMBOL = Symbol.for('blocknote.shikiParser');

type ShikiHighlighter = Parameters<typeof createParser>[0];

export function ensureDualThemeShikiParser(): void {
  // Client-only: the parser is consumed by the ProseMirror view. (Also keeps
  // SSR from ever touching the highlighter machinery.)
  if (typeof window === 'undefined') return;
  const g = globalThis as Record<symbol, unknown>;
  if (g[PARSER_SYMBOL] || !codeBlockOptions.createHighlighter) return;

  let dualParser: Parser | null = null;
  g[PARSER_SYMBOL] = ((options) => {
    if (dualParser) return dualParser(options);
    // Share (or create) the same highlighter promise BlockNote's plugin uses.
    const promise = (g[HIGHLIGHTER_PROMISE_SYMBOL] ||=
      codeBlockOptions.createHighlighter!()) as Promise<ShikiHighlighter>;
    return promise.then((highlighter) => {
      dualParser = createParser(highlighter, {
        themes: { light: 'github-light', dark: 'github-dark' },
        defaultColor: false,
      });
    });
  }) satisfies Parser;
}
