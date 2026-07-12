# @sparkhub/kb-viewer

Read-only [BlockNote](https://www.blocknotejs.org/) viewer for **SparkHub Knowledge Base content** — renders the `content` block array served by SparkHub's public KB API exactly as it appears in SparkHub.

Why not render the markdown `body`? It's a **lossy projection** — as SparkHub's block set grows (diagrams, callouts, richer embeds), markdown flattens or drops them. This component is the faithful path: when SparkHub ships new block types, you upgrade this package instead of extending your own renderer.

## Install

```bash
npm i https://github.com/KainosSoftwareLtd/sparkhub-sdk/releases/download/v0.5.0/sparkhub-kb-viewer-0.5.0.tgz
```

Peer deps: `react` / `react-dom` 18 or 19.

## Use

```tsx
import { KbViewer } from "@sparkhub/kb-viewer";

// page = await fetch(`${base}/api/public/kb/spaces/${space}/pages/${slug}`).json()
<KbViewer
  content={page.content}
  resolveAssetUrl={(assetId) => `${base}/api/public/kb/assets/${assetId}`}
/>
```

## Props

| Prop | Type | Description |
|---|---|---|
| `content` | `unknown[]` | The `content` block array from a public KB page payload. Normalized before mounting — see [Crash guard](#crash-guard). |
| `resolveAssetUrl` | `(assetId: string) => string` *(optional)* | Maps a KB asset id to a URL your app can fetch — typically `` (id) => `${sparkhubBase}/api/public/kb/assets/${id}` ``. Used by `fileAsset` / `drawio` / `wrappedImage` blocks, whose props carry **bare asset ids** or **relative** serve paths that don't resolve from a partner-app origin. When omitted, blocks fall back to any URL already present in their props (works only when your app is served from the SparkHub origin). |
| `theme` | `"light" \| "dark"` *(optional)* | Explicit theme. Omit to follow the host page's `data-theme` attribute on `<html>` (`"dark"` → dark), observed live. |
| `className` | `string` *(optional)* | Extra class on the wrapper (default class `kb-viewer` is always present). |

## SparkHub custom-block parity

v0.5.0 renders BlockNote's standard block set **plus** SparkHub's custom blocks and inline content, as independent read-only implementations:

| SparkHub type | Rendering here | Notes |
|---|---|---|
| `callout` block | Styled admonition frame per `calloutType` (note / info / tip / warning / error) with icon | Colors are self-contained (no host CSS vars needed), legible in light & dark |
| `wrappedImage` block | `<img>` floated `left`/`right` at `widthPercent`, inline text wraps around it, optional caption | Uses `resolveAssetUrl` when the stored URL is a SparkHub asset serve path |
| `fileAsset` block | Filename card with a download link | Link requires `resolveAssetUrl` (props carry a bare asset id) |
| `drawio` block | `<img>` of the diagram's PNG render asset | Requires `resolveAssetUrl`; the draw.io editor is never loaded |
| `mermaid` block | Rendered to SVG via the `mermaid` library, **lazy-loaded** | Zero cost on pages without diagrams; output sanitized with DOMPurify (SVG profile, `securityLevel: 'strict'`, `htmlLabels: false`) |
| `mention` inline | Plain text (`@name`), **no link** | Deliberate: no user links on anonymous surfaces |
| `anchor` inline | Plain `<a>` for external URLs (`http(s)`/`mailto` only); plain text for SparkHub-object anchors | Object URLs are meaningless/leaky outside SparkHub; `javascript:`/`data:` URLs never become hrefs |
| `codeBlock` | BlockNote's default code block (`language` prop preserved) | **Tradeoff:** no shiki syntax highlighting (SparkHub's editor highlights; shipping shiki here was judged not worth the weight for v1) |
| `heading` | BlockNote's default heading | Identical rendering; SparkHub only disables *authoring* affordances (toggle headings) |

## Crash guard

The viewer **never throws on unknown content**. Before mounting, the document is normalized against the viewer schema:

- **Unknown (future) block types** → a neutral paragraph; inline text and child blocks are preserved.
- **Unknown inline-content types** → their plain text (dropped when there is none).
- **Unknown props on known types / enum props with out-of-range values** → dropped, so the schema default applies.
- As a last resort, an internal error boundary renders the page's plain text instead of blanking your page.

This means older viewer versions survive any future SparkHub block permanently — content degrades gracefully instead of crashing.

The normalizer is exported for advanced use: `normalizeDocument(content, info)`, `documentPlainText(blocks)`, and the live `viewerSchema`.

## Notes

- **Bundle weight** — BlockNote brings ProseMirror along; lazy-load on content routes so grids/lists never pay for it:

```tsx
const KbViewer = dynamic(() => import("@sparkhub/kb-viewer"), { ssr: false });
```

  `mermaid` (the heaviest dependency) is additionally lazy-loaded *inside* the viewer — it is only fetched when a page actually contains a mermaid diagram.

- **Styling** — the wrapper carries class `kb-viewer`; BlockNote's Mantine stylesheet is imported by the component (your bundler must handle CSS imports from node_modules — Next.js and Vite do). Custom blocks carry `kbv-*` classes (`kbv-callout`, `kbv-mermaid`, `kbv-file-asset`, `kbv-drawio`, `kbv-wrapped-image`, `kbv-mention`, `kbv-anchor`) for host overrides.
