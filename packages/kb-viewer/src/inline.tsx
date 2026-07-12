/**
 * Read-only parity renderers for SparkHub's custom INLINE content types.
 *
 * Anonymous-surface policy (deliberate, mirrors the #1153 spec):
 *   - `mention` renders as PLAIN TEXT (`@name`) — no user links / profiles on
 *     anonymous surfaces.
 *   - `anchor` renders as a plain <a> ONLY for external URLs (`kind: 'link'`);
 *     SparkHub-object anchors (workbook/ticket/kb-page/…) render as plain text
 *     — those URLs are meaningless (and leaky) outside SparkHub.
 */
import { createReactInlineContentSpec } from "@blocknote/react";

export const Mention = createReactInlineContentSpec(
  {
    type: "mention",
    propSchema: {
      userId: { default: "" },
      name: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => (
      <span className="kbv-mention" style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
        @{inlineContent.props.name}
      </span>
    ),
  },
);

export const Anchor = createReactInlineContentSpec(
  {
    type: "anchor",
    propSchema: {
      url: { default: "" },
      kind: { default: "link" },
      title: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => {
      const { url, kind, title } = inlineContent.props;
      const label = title || url;
      // Stored content JSON is author-controlled — only ever emit an http(s)
      // or mailto href (never javascript:/data:), matching the SparkHub-side
      // guard. Object anchors degrade to plain text on this anonymous surface.
      const safeHref = kind === "link" && /^(https?|mailto):/i.test(url) ? url : undefined;
      if (!safeHref) {
        return <span className="kbv-anchor">{label}</span>;
      }
      return (
        <a
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="kbv-anchor"
          title={url}
        >
          {label}
        </a>
      );
    },
  },
);
