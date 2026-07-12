/**
 * Read-only parity renderers for SparkHub's custom blocks — INDEPENDENT
 * implementations that mirror the visual intent of the SparkHub editor's
 * blocks (`src/features/shared/block-editor/blocks/*` in the SparkHub app),
 * with every authoring affordance removed. The prop shapes (block type names,
 * propSchema keys, defaults) MUST stay wire-compatible with the app schema —
 * that contract is what makes stored documents portable.
 *
 * Styling is self-contained inline CSS (no Tailwind / CSS-var dependency on
 * the host) with fixed colors chosen to read on both light and dark themes.
 */
import { useEffect, useState } from "react";
import type { InlineContentSchema, StyleSchema } from "@blocknote/core";
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from "@blocknote/react";
import { useResolveAssetUrl, resolveMaybeAssetUrl } from "./asset-url";
import {
  StickyNoteIcon,
  InfoIcon,
  LightbulbIcon,
  TriangleAlertIcon,
  OctagonAlertIcon,
  FileTextIcon,
  DownloadIcon,
  WorkflowIcon,
} from "./icons";

// ─────────────────────────────────────────────────────────── callout ──

export const CALLOUT_TYPES = ["note", "info", "tip", "warning", "error"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

interface CalloutStyle {
  Icon: (p: { size?: number }) => ReturnType<typeof InfoIcon>;
  label: string;
  /** base color, used at full strength for the icon and low alpha for the frame */
  r: number;
  g: number;
  b: number;
}

const CALLOUT_STYLES: Record<CalloutType, CalloutStyle> = {
  note: { Icon: StickyNoteIcon, label: "Note", r: 168, g: 85, b: 247 }, // purple
  info: { Icon: InfoIcon, label: "Info", r: 59, g: 130, b: 246 }, // blue
  tip: { Icon: LightbulbIcon, label: "Tip", r: 34, g: 197, b: 94 }, // green
  warning: { Icon: TriangleAlertIcon, label: "Warning", r: 245, g: 158, b: 11 }, // amber
  error: { Icon: OctagonAlertIcon, label: "Error", r: 239, g: 68, b: 68 }, // red
};

const calloutConfig = {
  type: "callout",
  propSchema: {
    calloutType: { default: "note", values: [...CALLOUT_TYPES] },
  },
  content: "inline",
} as const;

function CalloutView({ block, contentRef }: ReactCustomBlockRenderProps<typeof calloutConfig, InlineContentSchema, StyleSchema>) {
  const type = (block.props.calloutType as CalloutType) ?? "note";
  const s = CALLOUT_STYLES[type] ?? CALLOUT_STYLES.note;
  const Icon = s.Icon;
  return (
    <div
      className="kbv-callout"
      data-callout-type={type}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: "100%",
        border: `1px solid rgba(${s.r}, ${s.g}, ${s.b}, 0.3)`,
        background: `rgba(${s.r}, ${s.g}, ${s.b}, 0.1)`,
        borderRadius: 8,
        padding: "8px 12px",
      }}
    >
      <span
        aria-label={s.label}
        style={{ color: `rgb(${s.r}, ${s.g}, ${s.b})`, flexShrink: 0, marginTop: 2, display: "inline-flex" }}
      >
        <Icon size={16} />
      </span>
      <div style={{ minWidth: 0, flex: 1, lineHeight: 1.625 }} ref={contentRef} />
    </div>
  );
}

export const CalloutBlock = createReactBlockSpec(calloutConfig, {
  render: (props) => <CalloutView {...props} />,
});

// ──────────────────────────────────────────────────────── wrappedImage ──

const WRAPPED_IMAGE_SIDES = ["left", "right"] as const;
type WrappedImageSide = (typeof WRAPPED_IMAGE_SIDES)[number];

const wrappedImageConfig = {
  type: "wrappedImage",
  propSchema: {
    url: { default: "" },
    caption: { default: "" },
    side: { default: "left", values: [...WRAPPED_IMAGE_SIDES] },
    widthPercent: { default: 40 },
  },
  content: "inline",
} as const;

function WrappedImageView({
  block,
  contentRef,
}: ReactCustomBlockRenderProps<typeof wrappedImageConfig, InlineContentSchema, StyleSchema>) {
  const resolve = useResolveAssetUrl();
  const { url, caption, widthPercent } = block.props;
  const side = (block.props.side as WrappedImageSide) ?? "left";
  const src = resolveMaybeAssetUrl(url, resolve);
  // CRITICAL layout constraint (mirrors the app block): the outer container
  // must stay PLAIN BLOCK FLOW — no flex/grid/overflow — or the float wrap dies.
  return (
    <div className="kbv-wrapped-image" style={{ width: "100%", lineHeight: 1.625 }}>
      <figure
        style={{
          float: side,
          width: `${widthPercent}%`,
          margin: side === "left" ? "0 1rem 0.5rem 0" : "0 0 0.5rem 1rem",
        }}
      >
        {src ? (
          <img
            src={src}
            alt={caption || ""}
            draggable={false}
            style={{ width: "100%", borderRadius: 4, border: "1px solid rgba(128, 128, 128, 0.35)" }}
          />
        ) : (
          <div
            style={{
              aspectRatio: "4 / 3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              border: "1px dashed rgba(128, 128, 128, 0.5)",
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            No image
          </div>
        )}
        {src && caption ? (
          <figcaption style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>{caption}</figcaption>
        ) : null}
      </figure>
      <div style={{ minWidth: 0 }} ref={contentRef} />
      {/* Contain the float so sibling blocks stack below. */}
      <div style={{ clear: "both" }} />
    </div>
  );
}

export const WrappedImageBlock = createReactBlockSpec(wrappedImageConfig, {
  render: (props) => <WrappedImageView {...props} />,
});

// ─────────────────────────────────────────────────────────── fileAsset ──

const fileAssetConfig = {
  type: "fileAsset",
  propSchema: {
    assetId: { default: "" },
    name: { default: "" },
  },
  content: "none",
} as const;

const cardFrame: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(128, 128, 128, 0.35)",
  borderRadius: 6,
  overflow: "hidden",
};

const cardHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "6px 12px",
  background: "rgba(128, 128, 128, 0.08)",
};

const emptyCard: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px dashed rgba(128, 128, 128, 0.5)",
  borderRadius: 6,
  padding: 12,
  fontSize: 13,
  opacity: 0.7,
};

function FileAssetView({ block }: ReactCustomBlockRenderProps<typeof fileAssetConfig, InlineContentSchema, StyleSchema>) {
  const resolve = useResolveAssetUrl();
  const { assetId, name } = block.props;

  if (!assetId) {
    return (
      <div className="kbv-file-asset" style={emptyCard}>
        <FileTextIcon size={16} /> No file selected
      </div>
    );
  }

  const href = resolve ? resolve(assetId) : null;
  return (
    <div className="kbv-file-asset" style={cardFrame}>
      <div style={cardHeader}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 500,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          <FileTextIcon size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
          {name || "File"}
        </span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            download={name || undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              flexShrink: 0,
              textDecoration: "none",
              color: "inherit",
              opacity: 0.8,
            }}
          >
            Download <DownloadIcon size={12} />
          </a>
        ) : null}
      </div>
    </div>
  );
}

export const FileAssetBlock = createReactBlockSpec(fileAssetConfig, {
  render: (props) => <FileAssetView {...props} />,
});

// ────────────────────────────────────────────────────────────── drawio ──

const drawioConfig = {
  type: "drawio",
  propSchema: {
    /** The `image`-kind PNG RENDER asset id — the only half embedded. */
    pngAssetId: { default: "" },
    /** The `drawio`-kind SOURCE asset id — never rendered here. */
    sourceAssetId: { default: "" },
  },
  content: "none",
} as const;

function DrawioView({ block }: ReactCustomBlockRenderProps<typeof drawioConfig, InlineContentSchema, StyleSchema>) {
  const resolve = useResolveAssetUrl();
  const { pngAssetId } = block.props;

  if (!pngAssetId) {
    return (
      <div className="kbv-drawio" style={emptyCard}>
        <WorkflowIcon size={16} /> No diagram selected
      </div>
    );
  }

  const src = resolve ? resolve(pngAssetId) : null;
  return (
    <div className="kbv-drawio" style={cardFrame}>
      <div style={{ ...cardHeader, borderBottom: "1px solid rgba(128, 128, 128, 0.35)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500 }}>
          <WorkflowIcon size={14} style={{ opacity: 0.6 }} />
          Diagram
        </span>
      </div>
      <div style={{ padding: 8 }}>
        {src ? (
          <img src={src} alt="Diagram" style={{ display: "block", margin: "0 auto", maxWidth: "100%" }} />
        ) : (
          <div style={{ fontSize: 12, opacity: 0.7, textAlign: "center", padding: 12 }}>
            Diagram preview unavailable (no asset resolver configured)
          </div>
        )}
      </div>
    </div>
  );
}

export const DrawioBlock = createReactBlockSpec(drawioConfig, {
  render: (props) => <DrawioView {...props} />,
});

// ───────────────────────────────────────────────────────────── mermaid ──

const mermaidConfig = {
  type: "mermaid",
  propSchema: {
    code: { default: "" },
  },
  content: "none",
} as const;

type MermaidModule = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
};

type SanitizeFn = (svg: string) => string;

let mermaidPromise: Promise<{ mermaid: MermaidModule; sanitize: SanitizeFn }> | null = null;

/**
 * LAZY mermaid loader — the library is the heaviest dependency in this
 * package, so it is dynamic-imported on first mermaid block encountered;
 * pages without diagrams never pay for it. DOMPurify loads in the same lazy
 * chunk (it's already a transitive dependency of mermaid).
 *
 * SECURITY (mirrors SparkHub's own mermaid setup):
 *   - `securityLevel: 'strict'` — per-diagram `%%{init}%%` directives ignored.
 *   - the emitted SVG is passed through DOMPurify's SVG profile, which strips
 *     `<foreignObject>` (an SVG XSS vector — it can carry arbitrary HTML).
 *   - top-level `htmlLabels: false` so node AND edge labels render as SVG
 *     `<text>` that survives that DOMPurify pass (with htmlLabels on, labels
 *     live in `<foreignObject>` and would sanitize away to empty boxes).
 */
function loadMermaid(): Promise<{ mermaid: MermaidModule; sanitize: SanitizeFn }> {
  if (!mermaidPromise) {
    mermaidPromise = Promise.all([import("mermaid"), import("dompurify")]).then(
      ([mermaidMod, purifyMod]) => {
        const mermaid = (mermaidMod.default ?? mermaidMod) as unknown as MermaidModule;
        const DOMPurify = purifyMod.default ?? purifyMod;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "default",
          htmlLabels: false,
        });
        const sanitize: SanitizeFn = (svg) =>
          DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true, html: true } });
        return { mermaid, sanitize };
      },
    );
  }
  return mermaidPromise;
}

function MermaidView({ block }: ReactCustomBlockRenderProps<typeof mermaidConfig, InlineContentSchema, StyleSchema>) {
  const code = block.props.code;
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!code) {
      setSvg("");
      setError(null);
      return;
    }
    void (async () => {
      try {
        const { mermaid, sanitize } = await loadMermaid();
        // The render id must be a valid CSS identifier.
        const domId = `kbv-mmd-${block.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
        const rendered = await mermaid.render(domId, code);
        if (!cancelled) {
          setSvg(sanitize(rendered.svg));
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, block.id]);

  return (
    <div
      className="kbv-mermaid"
      style={{
        border: "1px solid rgba(128, 128, 128, 0.35)",
        borderRadius: 8,
        padding: 12,
        width: "100%",
        overflowX: "auto",
      }}
    >
      {error ? (
        <pre style={{ color: "rgb(239, 68, 68)", whiteSpace: "pre-wrap", margin: 0, fontSize: 12 }}>
          Mermaid error: {error}
        </pre>
      ) : svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div style={{ fontSize: 12, opacity: 0.6 }}>{code ? "Rendering diagram…" : "Empty diagram"}</div>
      )}
    </div>
  );
}

export const MermaidBlock = createReactBlockSpec(mermaidConfig, {
  render: (props) => <MermaidView {...props} />,
});
