'use client';

import { AlignCenter, AlignLeft, AlignRight, RotateCcw, Settings2 } from 'lucide-react';
import { Popover } from '@mantine/core';
import type { blockEditorSchema } from './schema';
import {
  TABLE_ALIGNMENTS,
  TABLE_BORDER_DEFAULTS,
  TABLE_BORDER_MAX_WIDTH,
  TABLE_BORDER_MIN_WIDTH,
  TABLE_BORDER_STYLES,
  type TableAlignment,
  type TableBorderProps,
  type TableBorderStyle,
} from './table-borders';

type BlockEditorInstance = typeof blockEditorSchema.BlockNoteEditor;

const STYLE_LABELS: Record<TableBorderStyle, string> = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
  none: 'None',
};

const ALIGN_ICONS: Record<TableAlignment, typeof AlignLeft> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
};

/** Preset swatches — semantic tokens only (per CLAUDE.md), default first. */
const COLOR_SWATCHES: { label: string; value: string }[] = [
  { label: 'Default', value: TABLE_BORDER_DEFAULTS.borderColor },
  { label: 'Strong', value: 'var(--foreground)' },
  { label: 'Muted', value: 'var(--muted-foreground)' },
  { label: 'Primary', value: 'var(--primary)' },
  { label: 'Info', value: 'var(--info)' },
  { label: 'Success', value: 'var(--success)' },
  { label: 'Warning', value: 'var(--warning)' },
  { label: 'Destructive', value: 'var(--destructive)' },
];

const WIDTH_OPTIONS = Array.from(
  { length: TABLE_BORDER_MAX_WIDTH - TABLE_BORDER_MIN_WIDTH + 1 },
  (_, i) => TABLE_BORDER_MIN_WIDTH + i,
);

function OptionButton({
  selected,
  onClick,
  title,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      onClick={onClick}
      className={[
        'rounded border px-2 py-1 text-xs leading-none',
        selected
          ? 'border-ring bg-accent text-foreground'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export interface TableMenuProps {
  editor: BlockEditorInstance;
  blockId: string;
  /** Current resolved decoration config (from the decoration pass). */
  config: TableBorderProps;
  /** Overlay position (relative to the editor wrapper). */
  top: number;
  right: number;
  /** Button shown at full strength (table hovered / caret inside / menu open). */
  visible: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHoverChange: (hovering: boolean) => void;
}

/**
 * Per-table settings menu (CR #1147 rework): a small floating button anchored
 * to the table's top-right corner (the proven #1146 overlay pattern — OUTSIDE
 * the ProseMirror DOM), shown while the table is hovered or the caret sits
 * inside it. Opens a Mantine Popover with border style / width / color and
 * table alignment.
 *
 * Deliberately uses ONLY plain buttons inside the popover — no nested
 * Selects. The original toolbar-hosted UI failed in prod precisely because a
 * Select's own portal counts as an "outside" interaction for the hosting
 * popover/toolbar and dismissed it before `onValueChange` could run
 * (`updateBlock` never fired for style/width, while the plain swatch buttons
 * worked — the "only color changes" symptom). Single-click buttons are the
 * interaction class that was proven to persist.
 */
export function TableMenu({
  editor,
  blockId,
  config,
  top,
  right,
  visible,
  open,
  onOpenChange,
  onHoverChange,
}: TableMenuProps) {
  const update = (patch: Partial<TableBorderProps>) => {
    editor.updateBlock(blockId, { props: patch });
  };

  return (
    <Popover opened={open} onChange={onOpenChange} withinPortal position="bottom-end" zIndex={10000}>
      <Popover.Target>
        <button
          type="button"
          className="bn-table-menu-btn"
          data-visible={visible || open ? 'true' : undefined}
          style={{ top, right }}
          title="Table settings"
          aria-label="Table settings"
          onMouseEnter={() => onHoverChange(true)}
          onMouseLeave={() => onHoverChange(false)}
        >
          <Settings2 size={14} />
        </button>
      </Popover.Target>
      <Popover.Dropdown className="bn-sh-table-popover">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Borders</span>
            <div className="flex gap-1">
              {TABLE_BORDER_STYLES.map((style) => (
                <OptionButton
                  key={style}
                  selected={config.borderStyle === style}
                  onClick={() => update({ borderStyle: style })}
                >
                  {STYLE_LABELS[style]}
                </OptionButton>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Width</span>
            <div className="flex gap-1">
              {WIDTH_OPTIONS.map((width) => (
                <OptionButton
                  key={width}
                  selected={config.borderWidth === width}
                  onClick={() => update({ borderWidth: width })}
                >
                  {width}px
                </OptionButton>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Color</span>
            <div className="flex flex-wrap justify-end gap-1">
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch.label}
                  type="button"
                  title={swatch.label}
                  aria-label={`Border color: ${swatch.label}`}
                  onClick={() => update({ borderColor: swatch.value })}
                  disabled={config.borderStyle === 'none'}
                  className="h-5 w-5 rounded-full border border-border disabled:opacity-40"
                  style={{
                    background: swatch.value,
                    outline:
                      config.borderColor === swatch.value ? '2px solid var(--ring)' : undefined,
                    outlineOffset: 1,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Alignment</span>
            <div className="flex gap-1">
              {TABLE_ALIGNMENTS.map((alignment) => {
                const Icon = ALIGN_ICONS[alignment];
                return (
                  <OptionButton
                    key={alignment}
                    title={`Align ${alignment}`}
                    selected={config.tableAlignment === alignment}
                    onClick={() => update({ tableAlignment: alignment })}
                  >
                    <Icon size={13} />
                  </OptionButton>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => update({ ...TABLE_BORDER_DEFAULTS })}
            className="self-end inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw size={12} />
            Reset to default
          </button>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
