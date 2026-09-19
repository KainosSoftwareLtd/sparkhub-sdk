'use client';

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { ImagePlus, PanelLeft, PanelRight, Pencil, RefreshCw } from 'lucide-react';
import { Popover, TextInput } from '@mantine/core';

/**
 * Wrapped image block — an image with REAL text wrap (the rest of the block's
 * inline text flows around a floated image), which BlockNote's stock `image`
 * block cannot do (it's a standalone block, no sibling content). See
 * `README.md` → "Wrapped Image" for the full write-up.
 *
 * THE critical layout constraint: the outer container must stay PLAIN BLOCK
 * FLOW. No flex/grid, no `overflow` on the container or the `contentRef`
 * wrapper — any of those establishes a new block formatting context and
 * silently kills the CSS float wrap (unlike `CalloutBlock`, which uses flex
 * for its icon+content row — do NOT copy that part here).
 */

export const WRAPPED_IMAGE_SIDES = ['left', 'right'] as const;
export type WrappedImageSide = (typeof WRAPPED_IMAGE_SIDES)[number];

/** Width is clamped to this range via the drag handle (and defensively on read). */
export const WRAPPED_IMAGE_MIN_WIDTH_PERCENT = 15;
export const WRAPPED_IMAGE_MAX_WIDTH_PERCENT = 70;

const clampWidthPercent = (w: number): number =>
  Math.min(WRAPPED_IMAGE_MAX_WIDTH_PERCENT, Math.max(WRAPPED_IMAGE_MIN_WIDTH_PERCENT, Math.round(w)));

const wrappedImageConfig = {
  type: 'wrappedImage',
  propSchema: {
    url: { default: '' },
    caption: { default: '' },
    side: { default: 'left', values: [...WRAPPED_IMAGE_SIDES] },
    widthPercent: { default: 40 },
  },
  content: 'inline',
} as const;

/** Margin so the wrapped text doesn't sit flush against the image. */
function figureMargin(side: WrappedImageSide): string {
  return side === 'left' ? '0 1rem 0.5rem 0' : '0 0 0.5rem 1rem';
}

/**
 * Render component for the wrapped-image block. Extracted to a named
 * component (not an inline `render: () => …` arrow) so the hooks below
 * satisfy `react-hooks/rules-of-hooks` — BlockNote invokes this as a React
 * component.
 */
function WrappedImageBlockView({
  block,
  editor,
  contentRef,
}: ReactCustomBlockRenderProps<typeof wrappedImageConfig>) {
  const { url, caption, widthPercent } = block.props;
  const side = (block.props.side as WrappedImageSide) ?? 'left';
  const editable = editor.isEditable;

  const [hovering, setHovering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(caption);

  // Live (uncommitted) width while dragging the resize handle — gives instant
  // visual feedback without spamming `editor.updateBlock` on every pixel.
  const [dragging, setDragging] = useState(false);
  const [liveWidthPercent, setLiveWidthPercent] = useState(widthPercent);
  const dragState = useRef<{ startX: number; startWidth: number; containerWidth: number } | null>(null);
  const outerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCaptionDraft(caption);
  }, [caption]);

  useEffect(() => {
    if (!dragging) setLiveWidthPercent(widthPercent);
  }, [widthPercent, dragging]);

  const displayWidthPercent = dragging ? liveWidthPercent : widthPercent;
  const toolbarVisible = editable && (hovering || captionOpen || dragging);

  const commitCaption = (): void => {
    setCaptionOpen(false);
    if (captionDraft !== caption) {
      editor.updateBlock(block, { props: { caption: captionDraft } });
    }
  };

  const setSide = (next: WrappedImageSide): void => {
    if (next !== side) editor.updateBlock(block, { props: { side: next } });
  };

  const openFilePicker = (): void => {
    if (editable) fileInputRef.current?.click();
  };

  const handleFilePicked = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // Reset so picking the exact same file again still fires onChange.
    e.target.value = '';
    if (!file || !editor.uploadFile) return;
    setUploading(true);
    try {
      // Reuse the editor's configured upload path VERBATIM — the same
      // `editor.uploadFile` the built-in `image` block uses. Never invent a
      // new upload endpoint here.
      const result = await editor.uploadFile(file, block.id);
      const nextUrl = typeof result === 'string' ? result : (result?.url as string | undefined);
      if (nextUrl) editor.updateBlock(block, { props: { url: nextUrl } });
    } finally {
      setUploading(false);
    }
  };

  // ── Drag-resize (pointer events, with capture so the drag survives moving
  // off the small handle element; preventDefault + stopPropagation on pointer
  // down so BlockNote never turns the drag into a text selection). ──────────
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!editable || !outerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startWidth: widthPercent,
      containerWidth: outerRef.current.clientWidth,
    };
    setDragging(true);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragState.current;
    if (!drag) return;
    const deltaPx = e.clientX - drag.startX;
    // The handle sits on the edge NEXT TO the wrapped text (the edge that
    // actually moves as width changes — the float keeps the opposite, outer
    // edge pinned to the container). Dragging toward the text grows the
    // image on the left-floated case; the sign flips when floated right.
    const sign = side === 'left' ? 1 : -1;
    const deltaPercent = ((deltaPx * sign) / drag.containerWidth) * 100;
    setLiveWidthPercent(clampWidthPercent(drag.startWidth + deltaPercent));
  };

  const endDrag = (): void => {
    if (!dragState.current) return;
    dragState.current = null;
    setDragging(false);
    if (liveWidthPercent !== widthPercent) {
      editor.updateBlock(block, { props: { widthPercent: liveWidthPercent } });
    }
  };

  return (
    <div className="w-full leading-relaxed" ref={outerRef}>
      <figure
        style={{
          float: side,
          width: `${displayWidthPercent}%`,
          margin: figureMargin(side),
          position: 'relative',
        }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFilePicked(e)}
        />

        {url ? (
          <img src={url} alt={caption || ''} className="w-full rounded border border-border" draggable={false} />
        ) : editable ? (
          <button
            type="button"
            onClick={openFilePicker}
            onMouseDown={(e) => e.preventDefault()}
            disabled={uploading}
            style={{ aspectRatio: '4 / 3' }}
            className="flex w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-border bg-muted/50 text-muted-foreground hover:bg-muted disabled:opacity-60"
          >
            <ImagePlus className="h-5 w-5" />
            <span className="text-xs">{uploading ? 'Uploading…' : 'Click to add image'}</span>
          </button>
        ) : (
          <div
            style={{ aspectRatio: '4 / 3' }}
            className="flex w-full items-center justify-center rounded border border-dashed border-border text-muted-foreground"
          >
            <span className="text-xs">No image</span>
          </div>
        )}

        {url && caption ? <figcaption className="mt-1 text-xs text-muted-foreground">{caption}</figcaption> : null}

        {toolbarVisible && (
          <div className="absolute right-1 top-1 z-10 flex items-center gap-0.5 rounded-md border border-border bg-popover/95 p-0.5 shadow-sm">
            <button
              type="button"
              title="Wrap on the left"
              aria-label="Wrap on the left"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setSide('left')}
              className={`flex h-6 w-6 items-center justify-center rounded ${side === 'left' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent'}`}
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Wrap on the right"
              aria-label="Wrap on the right"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setSide('right')}
              className={`flex h-6 w-6 items-center justify-center rounded ${side === 'right' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent'}`}
            >
              <PanelRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Replace image"
              aria-label="Replace image"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openFilePicker}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <Popover
              opened={captionOpen}
              onChange={(open) => (open ? setCaptionOpen(true) : commitCaption())}
              withinPortal
              position="bottom-end"
              zIndex={10000}
            >
              <Popover.Target>
                <button
                  type="button"
                  title="Edit caption"
                  aria-label="Edit caption"
                  onMouseDown={(e) => e.preventDefault()}
                  className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </Popover.Target>
              <Popover.Dropdown className="bn-sh-caption-popover">
                <TextInput
                  size="xs"
                  autoFocus
                  value={captionDraft}
                  placeholder="Caption…"
                  onChange={(e) => setCaptionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitCaption();
                  }}
                />
              </Popover.Dropdown>
            </Popover>
          </div>
        )}

        {editable && (
          // Drag-resize handle — a vertical bar on the figure's outer edge.
          // Clamped to WRAPPED_IMAGE_MIN/MAX_WIDTH_PERCENT.
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize image"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              [side === 'left' ? 'right' : 'left']: -4,
              width: 8,
              cursor: 'col-resize',
              opacity: hovering || dragging ? 1 : 0,
            }}
            className="transition-opacity"
          >
            <div className="mx-auto h-full w-1 rounded bg-border" />
          </div>
        )}
      </figure>

      <div className="min-w-0" ref={contentRef} />

      {/* Contain the float so sibling blocks stack normally below, instead of
          wrapping around this block's image too. */}
      <div style={{ clear: 'both' }} />
    </div>
  );
}

/**
 * Static export render — same figure/float structure, no interactive chrome,
 * so exported HTML keeps the wrap (`float` + explicit `width` inline styles).
 * `contentRef` is filled in by BlockNote's exporter with the block's actual
 * inline content DOM (same mechanism as the interactive render).
 */
function WrappedImageToExternalHTML({
  block,
  contentRef,
}: ReactCustomBlockRenderProps<typeof wrappedImageConfig>) {
  const { url, caption, widthPercent } = block.props;
  const side = (block.props.side as WrappedImageSide) ?? 'left';
  return (
    <div className="w-full leading-relaxed">
      <figure style={{ float: side, width: `${widthPercent}%`, margin: figureMargin(side) }}>
        {url ? <img src={url} alt={caption || ''} /> : null}
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
      <div ref={contentRef} />
      <div style={{ clear: 'both' }} />
    </div>
  );
}

export const WrappedImageBlock = createReactBlockSpec(wrappedImageConfig, {
  render: (props) => <WrappedImageBlockView {...props} />,
  toExternalHTML: (props) => <WrappedImageToExternalHTML {...props} />,
});
