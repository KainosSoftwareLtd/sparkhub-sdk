'use client';

import { createReactBlockSpec, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { useEffect, useState } from 'react';
import { getMermaid, sanitizeMermaidSvg } from '../mermaid';

/**
 * Mermaid diagram block — a custom BlockNote block (BlockNote ships no Mermaid
 * block out of the box, but it's a textbook `createReactBlockSpec` use case).
 *
 * The diagram source lives in the block's `code` prop (part of the BlockNote
 * JSON document, so it round-trips and carries the block's stable id). The
 * renderer compiles the source to SVG with the `mermaid` library; clicking the
 * preview (when editable) flips to a source textarea that commits on blur.
 */

const DEFAULT_CODE = 'graph TD;\n  A[Start] --> B{Decision};\n  B -->|Yes| C[Do it];\n  B -->|No| D[Skip];';

const mermaidConfig = {
  type: 'mermaid',
  propSchema: {
    code: { default: DEFAULT_CODE },
  },
  content: 'none',
} as const;

/**
 * Render component for the mermaid block. Extracted to a named component (not
 * an inline `render: () => …` arrow) so the hooks below satisfy
 * `react-hooks/rules-of-hooks` — BlockNote invokes this as a React component.
 */
function MermaidBlockView({
  block,
  editor,
}: ReactCustomBlockRenderProps<typeof mermaidConfig>) {
  const code = block.props.code;
  const editable = editor.isEditable;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(code);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(code);
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mermaid = await getMermaid();
        const rendered = await mermaid.render(`mmd-${block.id}`, code || '');
        if (!cancelled) {
          setSvg(sanitizeMermaidSvg(rendered.svg));
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

  const commit = (): void => {
    if (draft !== code) {
      editor.updateBlock(block, { props: { code: draft } });
    }
    setEditing(false);
  };

  return (
    <div
      className="bn-mermaid-block"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 12,
        width: '100%',
      }}
    >
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          spellCheck={false}
          // Stop BlockNote from intercepting editing keystrokes/selection.
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          style={{
            width: '100%',
            minHeight: 120,
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 13,
            background: 'var(--muted)',
            color: 'var(--foreground)',
            border: '1px solid var(--input)',
            borderRadius: 6,
            padding: 8,
            resize: 'vertical',
          }}
        />
      ) : (
        <div
          role={editable ? 'button' : undefined}
          tabIndex={editable ? 0 : undefined}
          onClick={() => editable && setEditing(true)}
          style={{ cursor: editable ? 'pointer' : 'default', overflowX: 'auto' }}
        >
          {error ? (
            <pre style={{ color: 'var(--destructive)', whiteSpace: 'pre-wrap', margin: 0 }}>
              Mermaid error: {error}
            </pre>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          )}
        </div>
      )}
    </div>
  );
}

export const MermaidBlock = createReactBlockSpec(mermaidConfig, {
  render: (props) => <MermaidBlockView {...props} />,
});
