"use client";

/**
 * KbViewer — read-only BlockNote renderer for SparkHub Knowledge Base content.
 *
 * Renders the raw `content` block array served by SparkHub's public KB API
 * (`GET /api/public/kb/spaces/{space}/pages/{slug}` → `page.content`) exactly
 * as it appears in SparkHub — the markdown `body` on the same payload is a
 * lossy projection; this component is the faithful path, and it tracks
 * SparkHub's block set as it grows (bump this package, not your renderer).
 *
 * v0.5.0 — custom-block parity + crash guard:
 *   - SparkHub custom blocks render natively: `callout`, `wrappedImage`,
 *     `fileAsset`, `drawio`, `mermaid` (lazy-loaded), plus `mention`/`anchor`
 *     inline content (rendered anonymous-surface-safe).
 *   - CRASH GUARD: the document is normalized before mounting — unknown
 *     (future) block types degrade to paragraphs (text + children preserved),
 *     unknown inline types to their plain text, unknown props are dropped.
 *     A last-resort error boundary renders the page's plain text. The viewer
 *     never throws on unknown content.
 *   - `resolveAssetUrl` maps KB asset ids to fetchable URLs (block props carry
 *     bare asset ids / relative public serve paths — see `asset-url.ts`).
 *
 * Theming: follows the host page's `data-theme` attribute on <html>
 * (`"dark"` → dark; anything else → light), observed live — or pass an
 * explicit `theme` prop to opt out of the observer.
 *
 * Weight note: BlockNote brings ProseMirror along. Lazy-load this component
 * on content routes (e.g. `next/dynamic` with `ssr: false`) so list/grid
 * views never pay for it. The `mermaid` library is lazy-loaded internally —
 * pages without diagrams never fetch it.
 */

import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

import { viewerSchema, viewerSchemaInfo } from "./schema";
import { normalizeDocument, documentPlainText } from "./normalize";
import { AssetUrlContext, type ResolveAssetUrl } from "./asset-url";

export interface KbViewerProps {
  /** The `content` block array from a SparkHub public KB page payload. */
  content: unknown[];
  /** Explicit theme; omit to follow the host page's `data-theme` attribute. */
  theme?: "light" | "dark";
  /** Extra class on the wrapper (default class `kb-viewer` is always present). */
  className?: string;
  /**
   * Maps a SparkHub KB asset id to a URL this host can fetch — typically
   * `(id) => `${sparkhubBase}/api/public/kb/assets/${id}``. Used by the
   * `fileAsset` / `drawio` / `wrappedImage` blocks (their props carry bare
   * asset ids or relative serve paths). When omitted, blocks fall back to any
   * URL already present in their props (same-origin hosts only).
   */
  resolveAssetUrl?: ResolveAssetUrl;
}

type ViewerBlock = (typeof viewerSchema)["PartialBlock"];

function KbViewerInner({
  blocks,
  theme: themeProp,
  className,
  resolveAssetUrl,
}: {
  blocks: ViewerBlock[];
  theme?: "light" | "dark";
  className?: string;
  resolveAssetUrl?: ResolveAssetUrl;
}) {
  const editor = useCreateBlockNote({
    schema: viewerSchema,
    // BlockNote rejects an EMPTY initialContent array — omit it instead.
    initialContent: blocks.length > 0 ? blocks : undefined,
  });

  const [observedTheme, setObservedTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    if (themeProp) return;
    const read = () =>
      setObservedTheme(
        document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light",
      );
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, [themeProp]);

  return (
    <div className={className ? `kb-viewer ${className}` : "kb-viewer"}>
      <AssetUrlContext.Provider value={resolveAssetUrl ?? null}>
        <BlockNoteView editor={editor} editable={false} theme={themeProp ?? observedTheme} />
      </AssetUrlContext.Provider>
    </div>
  );
}

/**
 * Last-resort crash guard: normalization should make the document always
 * mountable, but if BlockNote still throws (bug, exotic payload), render the
 * page's plain text instead of blanking the host page.
 */
class KbViewerBoundary extends Component<
  { fallbackText: string; className?: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    if (this.state.failed) {
      const cls = this.props.className
        ? `kb-viewer kb-viewer-fallback ${this.props.className}`
        : "kb-viewer kb-viewer-fallback";
      return (
        <div className={cls} style={{ whiteSpace: "pre-wrap" }}>
          {this.props.fallbackText}
        </div>
      );
    }
    return this.props.children;
  }
}

/** Read-only BlockNote view over SparkHub KB `content`. Never throws. */
export function KbViewer({ content, theme, className, resolveAssetUrl }: KbViewerProps) {
  const blocks = useMemo(
    () => normalizeDocument(content, viewerSchemaInfo) as ViewerBlock[],
    [content],
  );
  const fallbackText = useMemo(() => documentPlainText(blocks), [blocks]);

  return (
    <KbViewerBoundary fallbackText={fallbackText} className={className}>
      <KbViewerInner
        blocks={blocks}
        theme={theme}
        className={className}
        resolveAssetUrl={resolveAssetUrl}
      />
    </KbViewerBoundary>
  );
}

export default KbViewer;
