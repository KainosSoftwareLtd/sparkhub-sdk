'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { Menu } from '@mantine/core';
import { ExternalLink, FileText, Loader2, Plus } from 'lucide-react';

/**
 * File asset block — an INLINE READ-ONLY PREVIEW of a KB File asset (#1128
 * Phase 1a). Editing always happens on the dedicated Monaco editor page
 * (`editUrlFor`); this block only renders + links out, per the locked design
 * ("heavy editor off the BlockNote canvas").
 *
 * Named `fileAsset` (NOT `file`) — BlockNote's OWN default block specs
 * (`defaultBlockSpecs`, spread into `schema.ts`) already register a built-in
 * `file` block (generic upload/attachment). This is an unrelated, KB-asset-
 * backed concept; a name collision would silently break one or the other.
 *
 * Generic by design: this file defines and exports `FileAssetContext`, a
 * plain provider shape any surface can supply (KB is simply the first/only
 * consumer today — see `knowledge-base/components/PageEditor.tsx`). Absent a
 * provider (non-KB surfaces), the block still renders its name; the
 * read-only preview needs a provider's `previewUrlFor` (the package never
 * assumes a host URL shape), and the "choose/create" authoring affordance
 * requires a provider too.
 */

export interface FileAssetInfo {
  assetId: string;
  name: string;
}

export interface FileAssetProvider {
  /** File-kind assets already on the current page — the "embed existing" list. */
  assets: FileAssetInfo[];
  /** Gates the "Open editor" link + the "Create new file…" affordance. */
  canEdit: boolean;
  /** Scope-aware content-serve URL for an asset (view-gated, e.g. `/kb/api/assets/<id>`). */
  previewUrlFor: (assetId: string) => string;
  /** Scope-aware dedicated-editor URL for an asset (e.g. `/kb/files/<id>/edit`). */
  editUrlFor: (assetId: string) => string;
  /** Opens the Create-file dialog; resolves the created asset, or null if cancelled. */
  createAsset: () => Promise<FileAssetInfo | null>;
  /**
   * Host-supplied code preview for the fetched file text (e.g. a read-only
   * Monaco with a language inferred from `name`); omitted → a plain `<pre>`.
   */
  renderPreview?: (input: { text: string; name: string; assetId: string }) => ReactNode;
}

export const FileAssetContext = createContext<FileAssetProvider | null>(null);

const fileAssetBlockConfig = {
  type: 'fileAsset',
  propSchema: {
    assetId: { default: '' },
    name: { default: '' },
  },
  content: 'none',
} as const;

function FileAssetPreview({
  assetId,
  name,
  provider,
}: {
  assetId: string;
  name: string;
  provider: FileAssetProvider | null;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // No provider (this block rendering outside a KB page) → no URL to fetch;
  // the block shows its name only. The package never assumes a host URL shape.
  const previewUrl = provider ? provider.previewUrlFor(assetId) : null;

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    if (!previewUrl) return;
    fetch(previewUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  return (
    <div className="w-full rounded border border-border overflow-hidden" contentEditable={false}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {name || 'File'}
        </span>
        {provider?.canEdit && (
          <a
            href={provider.editUrlFor(assetId)}
            target="_blank"
            rel="noreferrer"
            className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
          >
            Open editor <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <div className="max-h-80 overflow-auto">
        {error ? (
          <pre className="whitespace-pre-wrap p-3 text-xs text-destructive">{error}</pre>
        ) : !previewUrl ? null : text === null ? (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading preview…
          </div>
        ) : (
          provider?.renderPreview?.({ text, name, assetId }) ?? (
            <pre
              className="bn-file-asset-fallback"
              style={{ maxHeight: '18rem', overflow: 'auto', margin: 0, fontSize: '0.8rem' }}
            >
              {text}
            </pre>
          )
        )}
      </div>
    </div>
  );
}

/**
 * Render component for the file-asset block. Extracted to a named component
 * (not an inline `render: () => …` arrow) so the hooks satisfy
 * `react-hooks/rules-of-hooks` — BlockNote invokes this as a React component.
 */
function FileAssetBlockView({
  block,
  editor,
}: ReactCustomBlockRenderProps<typeof fileAssetBlockConfig>) {
  const provider = useContext(FileAssetContext);
  const editable = editor.isEditable;
  const { assetId, name } = block.props;

  const choose = (asset: FileAssetInfo): void => {
    editor.updateBlock(block, { props: { assetId: asset.assetId, name: asset.name } });
  };

  const createNew = async (): Promise<void> => {
    if (!provider) return;
    const created = await provider.createAsset();
    if (created) choose(created);
  };

  if (assetId) {
    return <FileAssetPreview assetId={assetId} name={name} provider={provider} />;
  }

  if (!editable) {
    return (
      <div className="flex items-center gap-2 rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
        <FileText className="h-4 w-4" /> No file selected
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
        File embedding is only available on Knowledge Base pages.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded border border-dashed border-border p-3">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Menu withinPortal position="bottom-start" zIndex={10000}>
        <Menu.Target>
          <button type="button" className="text-sm text-primary hover:underline">
            Choose a file asset…
          </button>
        </Menu.Target>
        {/* z above any RightPanel overlay (z-9999) the editor may render inside. */}
        <Menu.Dropdown className="bn-sh-file-menu">
          {provider.assets.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No file assets on this page yet
            </div>
          )}
          {provider.assets.map((a) => (
            <Menu.Item key={a.assetId} onClick={() => choose(a)}>
              {a.name}
            </Menu.Item>
          ))}
          <Menu.Divider />
          <Menu.Item leftSection={<Plus className="h-3.5 w-3.5" />} onClick={() => void createNew()}>
            Create new file…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}

export const FileAssetBlock = createReactBlockSpec(fileAssetBlockConfig, {
  render: (props) => <FileAssetBlockView {...props} />,
});
