# @sparkhub/kb-viewer

Read-only [BlockNote](https://www.blocknotejs.org/) viewer for **SparkHub Knowledge Base content** — renders the `content` block array served by SparkHub's public KB API exactly as it appears in SparkHub.

Why not render the markdown `body`? It's a **lossy projection** — as SparkHub's block set grows (diagrams, callouts, richer embeds), markdown flattens or drops them. This component is the faithful path: when SparkHub ships new block types, you upgrade this package instead of extending your own renderer.

## Install

```bash
npm i https://github.com/KainosSoftwareLtd/sparkhub-sdk/releases/download/v0.4.0/sparkhub-kb-viewer-0.4.0.tgz
```

Peer deps: `react` / `react-dom` 18 or 19.

## Use

```tsx
import { KbViewer } from "@sparkhub/kb-viewer";

// page = await fetch(`${base}/api/public/kb/spaces/${space}/pages/${slug}`).json()
<KbViewer content={page.content} />
```

- **Theming** — follows the host page's `data-theme` attribute on `<html>` (`"dark"` → dark), observed live. Pass `theme="light" | "dark"` to control it explicitly.
- **Bundle weight** — BlockNote brings ProseMirror along; lazy-load on content routes so grids/lists never pay for it:

```tsx
const KbViewer = dynamic(() => import("@sparkhub/kb-viewer"), { ssr: false });
```

- **Styling** — the wrapper carries class `kb-viewer`; BlockNote's Mantine stylesheet is imported by the component (your bundler must handle CSS imports from node_modules — Next.js and Vite do).

## Scope

v0.4.0 renders BlockNote's standard block set (paragraphs, headings, lists, code, quotes, tables, images). SparkHub custom-block parity (diagram embeds, mentions-as-labels) tracks the SparkHub KB editor roadmap.
