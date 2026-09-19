'use client';

import { useEffect, useState } from 'react';
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from '@blocknote/react';
import {
  Info,
  Lightbulb,
  TriangleAlert,
  OctagonAlert,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import { Menu } from '@mantine/core';

/**
 * Callout / admonition block (Confluence / Jira "info panel" style) — BlockNote
 * ships none, so this is a `createReactBlockSpec` custom block.
 *
 * Five types, each with its own icon + colour. The type is changed via a
 * dropdown picker (icon = trigger) that previews each type's icon/style — the
 * SAME picker the slash "Callout" command opens on insert (see
 * `pendingCalloutOpen`).
 */
export const CALLOUT_TYPES = ['note', 'info', 'tip', 'warning', 'error'] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

interface CalloutStyle {
  Icon: LucideIcon;
  label: string;
  /** container border+bg */
  box: string;
  /** icon colour */
  icon: string;
}

const STYLES: Record<CalloutType, CalloutStyle> = {
  // Note = the semantic `purple` accent token (themed light/dark via --purple).
  note: { Icon: StickyNote, label: 'Note', box: 'border-purple/30 bg-purple/10', icon: 'text-purple' },
  info: { Icon: Info, label: 'Info', box: 'border-info/30 bg-info/10', icon: 'text-info' },
  tip: { Icon: Lightbulb, label: 'Tip', box: 'border-success/30 bg-success/10', icon: 'text-success' },
  warning: { Icon: TriangleAlert, label: 'Warning', box: 'border-warning/30 bg-warning/10', icon: 'text-warning' },
  error: { Icon: OctagonAlert, label: 'Error', box: 'border-destructive/30 bg-destructive/10', icon: 'text-destructive' },
};

/** `{ type, label }` for each callout type. */
export const CALLOUT_TYPE_OPTIONS: { type: CalloutType; label: string }[] = CALLOUT_TYPES.map(
  (type) => ({ type, label: STYLES[type].label }),
);

/**
 * Block ids that should auto-open their type picker on mount. The slash
 * "Callout" command inserts a block with a known id and registers it here, so
 * the picker pops open immediately for the user to choose a type.
 */
export const pendingCalloutOpen = new Set<string>();

/** A single picker row — icon swatch + label. Shared look across the menu. */
function CalloutPickerItem({ type, onPick }: { type: CalloutType; onPick: (t: CalloutType) => void }) {
  const s = STYLES[type];
  const Icon = s.Icon;
  return (
    <Menu.Item
      onClick={() => onPick(type)}
      leftSection={
        <span className={`inline-flex h-5 w-5 items-center justify-center rounded border ${s.box} ${s.icon}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      }
    >
      {s.label}
    </Menu.Item>
  );
}

const calloutConfig = {
  type: 'callout',
  propSchema: {
    calloutType: { default: 'note', values: [...CALLOUT_TYPES] },
  },
  content: 'inline',
} as const;

/**
 * Render component for the callout block. Extracted to a named component (not
 * an inline `render: () => …` arrow) so the hooks below satisfy
 * `react-hooks/rules-of-hooks` — BlockNote invokes this as a React component.
 */
function CalloutBlockView({
  block,
  editor,
  contentRef,
}: ReactCustomBlockRenderProps<typeof calloutConfig>) {
  const type = (block.props.calloutType as CalloutType) ?? 'note';
  const style = STYLES[type] ?? STYLES.note;
  const Icon = style.Icon;
  const editable = editor.isEditable;
  const [open, setOpen] = useState(false);

  // Auto-open the picker when this block was just inserted via the slash menu.
  useEffect(() => {
    if (pendingCalloutOpen.has(block.id)) {
      pendingCalloutOpen.delete(block.id);
      setOpen(true);
    }
  }, [block.id]);

  const pick = (next: CalloutType): void => {
    editor.updateBlock(block, { props: { calloutType: next } });
  };

  return (
    // The colored frame is applied to the BlockNote block CONTAINER via CSS
    // (`.bn-callout-frame` + `data-callout-type`, see block-editor.css) so that
    // nested child blocks (image / list / code, indented under the callout)
    // render INSIDE the frame. This element keeps only the icon + content
    // layout; the border/background/padding live on the parent block.
    <div
      className="bn-callout-frame flex w-full items-start gap-2.5"
      data-callout-type={type}
    >
      {editable ? (
        <Menu opened={open} onChange={setOpen} withinPortal position="bottom-start" zIndex={10000}>
          <Menu.Target>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              title={`${style.label} — click to change type`}
              aria-label="Change callout type"
              className={`mt-0.5 shrink-0 cursor-pointer ${style.icon}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          </Menu.Target>
          {/* z above any RightPanel overlay (z-9999) the editor may render inside. */}
          <Menu.Dropdown className="bn-sh-callout-menu">
            {CALLOUT_TYPES.map((t) => (
              <CalloutPickerItem key={t} type={t} onPick={pick} />
            ))}
          </Menu.Dropdown>
        </Menu>
      ) : (
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.icon}`} aria-label={style.label} />
      )}
      <div className="min-w-0 flex-1 leading-relaxed" ref={contentRef} />
    </div>
  );
}

export const CalloutBlock = createReactBlockSpec(calloutConfig, {
  render: (props) => <CalloutBlockView {...props} />,
});
