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
 * Theming: follows the host page's `data-theme` attribute on <html>
 * (`"dark"` → dark; anything else → light), observed live — or pass an
 * explicit `theme` prop to opt out of the observer.
 *
 * Weight note: BlockNote brings ProseMirror along. Lazy-load this component
 * on content routes (e.g. `next/dynamic` with `ssr: false`) so list/grid
 * views never pay for it.
 */

import { useEffect, useMemo, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

export interface KbViewerProps {
  /** The `content` block array from a SparkHub public KB page payload. */
  content: unknown[];
  /** Explicit theme; omit to follow the host page's `data-theme` attribute. */
  theme?: "light" | "dark";
  /** Extra class on the wrapper (default class `kb-viewer` is always present). */
  className?: string;
}

/** Read-only BlockNote view over SparkHub KB `content`. */
export function KbViewer({ content, theme: themeProp, className }: KbViewerProps) {
  const initialContent = useMemo(() => content as PartialBlock[], [content]);
  const editor = useCreateBlockNote({ initialContent });

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
      <BlockNoteView editor={editor} editable={false} theme={themeProp ?? observedTheme} />
    </div>
  );
}

export default KbViewer;
