/**
 * LAZY mermaid loader for the `mermaid` block — the library is the heaviest
 * dependency in this package, so it is dynamic-imported on first render;
 * pages without diagrams never pay for it. DOMPurify loads in the same lazy
 * chunk. Mirrors `@sparkhub/kb-viewer`'s loader and SparkHub's own setup.
 *
 * SECURITY:
 *   - `securityLevel: 'strict'` — per-diagram `%%{init}%%` directives ignored.
 *   - the emitted SVG is passed through DOMPurify's SVG profile, which strips
 *     `<foreignObject>` (an SVG XSS vector — it can carry arbitrary HTML).
 *   - top-level `htmlLabels: false` so node AND edge labels render as SVG
 *     `<text>` that survives that DOMPurify pass (with htmlLabels on, labels
 *     live in `<foreignObject>` and would sanitize away to empty boxes).
 */
type MermaidModule = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
};

type SanitizeFn = (svg: string) => string;

let loaded: { mermaid: MermaidModule; sanitize: SanitizeFn } | null = null;
let loadPromise: Promise<{ mermaid: MermaidModule; sanitize: SanitizeFn }> | null = null;

function load(): Promise<{ mermaid: MermaidModule; sanitize: SanitizeFn }> {
  if (loaded) return Promise.resolve(loaded);
  if (!loadPromise) {
    loadPromise = Promise.all([import('mermaid'), import('dompurify')]).then(
      ([mermaidMod, purifyMod]) => {
        const mermaid = (mermaidMod.default ?? mermaidMod) as unknown as MermaidModule;
        const DOMPurify = purifyMod.default ?? purifyMod;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'default',
          htmlLabels: false,
        });
        const sanitize: SanitizeFn = (svg) =>
          DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true, html: true } });
        loaded = { mermaid, sanitize };
        return loaded;
      },
    );
  }
  return loadPromise;
}

/** The initialized mermaid module (lazy, memoized). */
export function getMermaid(): Promise<MermaidModule> {
  return load().then((l) => l.mermaid);
}

/**
 * DOMPurify SVG-profile sanitize of a rendered diagram. Before the lazy chunk
 * has loaded (or off the DOM) the input is returned unchanged — callers only
 * sanitize output of `getMermaid().render`, which implies the chunk is loaded.
 */
export function sanitizeMermaidSvg(svg: string): string {
  if (typeof window === 'undefined' || !loaded) return svg;
  return loaded.sanitize(svg);
}
