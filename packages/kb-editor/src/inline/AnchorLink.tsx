'use client';

import { createReactInlineContentSpec } from '@blocknote/react';
import {
  BookOpen,
  Boxes,
  FileText,
  Server,
  Activity,
  Ticket,
  BookText,
  Link as LinkIcon,
  type LucideIcon,
} from 'lucide-react';

/**
 * `anchor` inline content — a typed link to a SparkHub object (workbook,
 * component, document, ticket, KB page, tenant, …) or an arbitrary external
 * URL. Created by pasting a URL into the editor (see BlockEditor's
 * `pasteHandler` + the injected `resolveAnchor`), which resolves the URL to a
 * `{ kind, title }` and renders it as a pill with the matching type icon.
 *
 * Lives in the BlockNote JSON document (source of truth) and round-trips with
 * stable identity. SparkHub-object anchors can be auto-synced into a
 * conversation's subject/anchor set (see `extractAnchors`).
 */

/** Icon per anchor kind. `link` is the generic external-URL fallback. */
const KIND_ICONS: Record<string, LucideIcon> = {
  workbook: BookOpen,
  component: Boxes,
  document: FileText,
  tenant: Server,
  'background-process': Activity,
  ticket: Ticket,
  'kb-page': BookText,
  link: LinkIcon,
};

/** Human label per kind (used as a tooltip / fallback title prefix). */
export const ANCHOR_KIND_LABELS: Record<string, string> = {
  workbook: 'Workbook',
  component: 'Component',
  document: 'Document',
  tenant: 'Tenant',
  'background-process': 'Process',
  ticket: 'Ticket',
  'kb-page': 'KB page',
  link: 'Link',
};

export interface AnchorProps {
  /** Canonical URL the anchor points at. */
  url: string;
  /** Resolved kind — a SparkHub object type or `link` for external URLs. */
  kind: string;
  /** Display title (resolved object name, page title, or hostname). */
  title: string;
}

export const AnchorLink = createReactInlineContentSpec(
  {
    type: 'anchor',
    propSchema: {
      url: { default: '' },
      kind: { default: 'link' },
      title: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => {
      const { url, kind, title } = inlineContent.props;
      const Icon = KIND_ICONS[kind] ?? LinkIcon;
      const label = title || ANCHOR_KIND_LABELS[kind] || url;
      // Stored content JSON is client-controllable (the messages/KB APIs accept
      // arbitrary BlockEditorDocument), so an anchor `url` could be a
      // `javascript:`/`data:` URI. Only emit an http(s) or mailto href (matching
      // the write/projection guard `safeProjectionUrl`) — anything else renders
      // as a non-navigable pill. This is the primary XSS guard. (Standard
      // BlockNote `link` nodes render via BlockNote's own <a>, not this path.)
      const safeHref = /^(https?|mailto):/i.test(url) ? url : undefined;
      return (
        <a
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="bn-anchor"
          data-kind={kind}
          title={`${ANCHOR_KIND_LABELS[kind] ?? 'Link'} — ${url}`}
          contentEditable={false}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            verticalAlign: 'baseline',
            color: 'var(--primary)',
            background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
            borderRadius: 4,
            padding: '0 5px',
            fontWeight: 500,
            textDecoration: 'none',
            cursor: 'pointer',
            // A long label (e.g. a full URL) must truncate inside the pill,
            // not push the pill past its container (#1182). The full URL
            // remains readable via the tooltip.
            maxWidth: '100%',
            overflow: 'hidden',
          }}
        >
          <Icon size={13} style={{ flexShrink: 0 }} />
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </span>
        </a>
      );
    },
  },
);
