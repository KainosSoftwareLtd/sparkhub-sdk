'use client';

import { createReactInlineContentSpec, type DefaultReactSuggestionItem } from '@blocknote/react';

/**
 * `@mention` inline content — a custom BlockNote inline content type (the same
 * primitive used for SparkHub-object links). Mirrors the wire shape of the
 * existing Lexical `mentionPlugin` ({ userId, name }) so a future migration
 * from `SparkhubEditor` can map across cleanly.
 *
 * The mention is part of the block's inline content, so it lives inside the
 * BlockNote JSON document and round-trips with stable identity.
 */
export const Mention = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: {
      userId: { default: '' },
      name: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => (
      <span
        className="bn-mention"
        data-user-id={inlineContent.props.userId}
        style={{
          color: 'var(--primary)',
          background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
          borderRadius: 4,
          padding: '0 3px',
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        @{inlineContent.props.name}
      </span>
    ),
  },
);

export interface MentionUser {
  id: string;
  name: string;
  /** Optional — used to disambiguate same-name users in the menu. */
  email?: string;
}

/**
 * Builds the `@`-suggestion-menu items for a mention picker. In production the
 * `users` list comes from an org-member lookup (same source the existing
 * `MentionTypeahead` uses); the demo passes a mock list.
 *
 * BlockNote's `SuggestionMenuController` keys rendered items by `title`, so two
 * distinct users with the same display name (e.g. two "Zac Acker"s) would
 * collide React keys. We keep the inserted pill clean (`@name`) but make the
 * MENU title unique on collision by appending a disambiguator (email or a short
 * id), and surface the email as subtext for clarity.
 */
export function getMentionMenuItems(
  // The editor is the schema-typed BlockNote editor; `any` keeps this helper
  // decoupled from the full generic schema signature for the prototype.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any,
  users: MentionUser[],
): DefaultReactSuggestionItem[] {
  const nameCounts = new Map<string, number>();
  for (const u of users) nameCounts.set(u.name, (nameCounts.get(u.name) ?? 0) + 1);

  return users.map((user) => {
    const collides = (nameCounts.get(user.name) ?? 0) > 1;
    const disambiguator = user.email || `…${user.id.slice(-4)}`;
    return {
      // Display title is unique-per-render to keep React keys stable; the
      // inserted mention still carries the clean name.
      title: collides ? `${user.name} (${disambiguator})` : user.name,
      subtext: user.email,
      onItemClick: () => {
        editor.insertInlineContent([
          { type: 'mention', props: { userId: user.id, name: user.name } },
          ' ',
        ]);
      },
    };
  });
}
