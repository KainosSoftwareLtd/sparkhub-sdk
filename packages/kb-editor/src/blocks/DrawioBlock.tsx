'use client';

import { createContext, useContext } from 'react';
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { ExternalLink, Plus, Workflow } from 'lucide-react';
import { Menu } from '@mantine/core';

/**
 * Diagram (draw.io) block — a custom BlockNote block (#1128 Phase 1b; render
 * reworked #1278).
 *
 * The "two-asset model": a diagram is a PAIR of KB assets — a native `drawio`
 * SOURCE asset (mxGraph XML, NEVER embedded) and an `image` RENDER asset (the
 * thing embedded). As of #1278 the render is a plain SVG (`svgAssetId`); a
 * legacy diagram carries a `pngAssetId` PNG render instead, and this block
 * falls back to it until the diagram is re-saved (which mints an SVG and
 * self-heals). The block holds all three ids in its props
 * (`{ svgAssetId, pngAssetId, sourceAssetId }`, part of the BlockNote JSON so
 * they round-trip + carry the block's stable id) and renders the render half
 * as a plain read-only `<img>` — an image context, so a script-bearing SVG can
 * never execute (the security reason we render SVG via `<img>`, not inline).
 * Editing is a deliberate navigation OUT to the dedicated
 * `/kb/diagrams/<sourceAssetId>/edit` page (mirrors `FileBlock`).
 *
 * Server-projection-safe: `sparkmd.ts` emits `![diagram](.../assets/<renderId>)`
 * for a `drawio` block (SVG id if present, else the legacy PNG id — both are
 * normal servable images), so published / search / Teams-mirror projections see
 * a real image reference, not an opaque token.
 *
 * `DiagramAssetContext` is the diagram sibling of `FileBlock`'s
 * `FileAssetContext` — a plain provider shape a surface supplies to enable the
 * "choose existing / create new" authoring UI + the slash-menu item. Absent a
 * provider the block renders its name only (the render URL comes from the
 * provider's `renderUrlFor`; the package never assumes a host URL shape).
 * Today only KB pages wire a provider (`knowledge-base/components/PageEditor.tsx`).
 */

export interface DiagramAssetInfo {
  sourceAssetId: string;
  /** The SVG render id (#1278) — empty for a legacy PNG-only diagram. */
  svgAssetId: string;
  /** The legacy PNG render id — empty for a diagram created after #1278. */
  pngAssetId: string;
  name: string;
}

export interface DiagramAssetProvider {
  /** Diagram pairs already on the current page — the "embed existing" list. */
  diagrams: DiagramAssetInfo[];
  /** Gates the "Edit diagram" link + the "Create new diagram…" affordance. */
  canEdit: boolean;
  /** Scope-aware content-serve URL for a render asset id — SVG (#1278) or the
   *  legacy PNG; the serve mechanism is identical (just a different asset id). */
  renderUrlFor: (renderAssetId: string) => string;
  /** Scope-aware dedicated-editor URL for the diagram source (e.g. `/kb/diagrams/<id>/edit`). */
  editUrlFor: (sourceAssetId: string) => string;
  /** Opens the Create-diagram dialog; resolves the created pair, or null if cancelled. */
  createDiagram: () => Promise<DiagramAssetInfo | null>;
}

export const DiagramAssetContext = createContext<DiagramAssetProvider | null>(null);

const drawioBlockConfig = {
  type: 'drawio',
  propSchema: {
    /** The `image`-kind SVG RENDER asset id (#1278) — the half embedded. */
    svgAssetId: { default: '' },
    /** The legacy PNG RENDER asset id — kept for back-compat round-tripping of
     *  pre-#1278 stored blocks; used as a fallback when no `svgAssetId` yet. */
    pngAssetId: { default: '' },
    /** The `drawio`-kind SOURCE asset id — opens in the dedicated editor. */
    sourceAssetId: { default: '' },
  },
  content: 'none',
} as const;

function DrawioBlockView({
  block,
  editor,
}: ReactCustomBlockRenderProps<typeof drawioBlockConfig>) {
  const provider = useContext(DiagramAssetContext);
  const editable = editor.isEditable;
  const { svgAssetId, pngAssetId, sourceAssetId } = block.props;
  // Single generic render path: prefer the SVG render (#1278), else fall back to
  // a legacy PNG render for un-resaved diagrams.
  const renderId = svgAssetId || pngAssetId;

  const choose = (d: DiagramAssetInfo): void => {
    editor.updateBlock(block, {
      props: {
        svgAssetId: d.svgAssetId,
        pngAssetId: d.pngAssetId,
        sourceAssetId: d.sourceAssetId,
      },
    });
  };

  const createNew = async (): Promise<void> => {
    if (!provider) return;
    const created = await provider.createDiagram();
    if (created) choose(created);
  };

  // ── Rendered state: an embedded diagram (has an SVG or legacy PNG render). ──
  if (renderId) {
    const renderUrl = provider ? provider.renderUrlFor(renderId) : '';
    const editHref = sourceAssetId && provider ? provider.editUrlFor(sourceAssetId) : '';
    return (
      <div className="w-full rounded border border-border overflow-hidden" contentEditable={false}>
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
          <span className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
            <Workflow className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            Diagram
          </span>
          {provider?.canEdit && editHref && (
            <a
              href={editHref}
              target="_blank"
              rel="noreferrer"
              className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
            >
              Edit diagram <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="bg-card p-2">
          {renderUrl ? (
            <img
              src={renderUrl}
              alt="Diagram"
              className="mx-auto block max-w-full"
              onClick={() => {
                if (editable && editHref) window.open(editHref, '_blank', 'noopener');
              }}
              style={{ cursor: editable && editHref ? 'pointer' : 'default' }}
            />
          ) : (
            <div className="text-xs text-muted-foreground">Diagram render unavailable (no asset provider)</div>
          )}
        </div>
      </div>
    );
  }

  // ── Empty state (read-only): nothing to show. ──
  if (!editable) {
    return (
      <div className="flex items-center gap-2 rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
        <Workflow className="h-4 w-4" /> No diagram selected
      </div>
    );
  }

  // ── Empty state (editable, no provider): can't author here. ──
  if (!provider) {
    return (
      <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
        Diagram embedding is only available on Knowledge Base pages.
      </div>
    );
  }

  // ── Empty state (editable, provider present): choose existing / create new. ──
  return (
    <div className="flex items-center gap-2 rounded border border-dashed border-border p-3">
      <Workflow className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Menu withinPortal position="bottom-start" zIndex={10000}>
        <Menu.Target>
          <button type="button" className="text-sm text-primary hover:underline">
            Choose a diagram…
          </button>
        </Menu.Target>
        {/* z above any RightPanel overlay (z-9999) the editor may render inside. */}
        <Menu.Dropdown className="bn-sh-file-menu">
          {provider.diagrams.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No diagrams on this page yet
            </div>
          )}
          {provider.diagrams.map((d) => (
            <Menu.Item key={d.sourceAssetId} onClick={() => choose(d)}>
              {d.name}
            </Menu.Item>
          ))}
          <Menu.Divider />
          <Menu.Item leftSection={<Plus className="h-3.5 w-3.5" />} onClick={() => void createNew()}>
            Create new diagram…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

export const DrawioBlock = createReactBlockSpec(drawioBlockConfig, {
  render: (props) => <DrawioBlockView {...props} />,
});
