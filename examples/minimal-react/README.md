# Minimal React example

Vite + React reference implementation showing how to wrap [`@sparkhub/sdk`](../..) in a React provider + hook.

This example is **inside the SDK repo for reference**. To use it as a starting point for a real partner app, copy it out into its own repo (and replace `"@sparkhub/sdk": "file:../.."` in `package.json` with a release-tarball URL).

## What it shows

- `<SparkhubProvider>` — owns the `SparkhubClient` for the app's lifetime
- `useSparkhub()` hook — exposes `{ client, isAuthenticated, me, login, logout, refreshMe, isLoading, meError }`
- Automatic OAuth callback handling — the provider detects `?code=...` on initial mount and finishes the exchange
- Token refresh observability — wires the SDK's `onTokenRefresh` callback to a `console.log`
- Cross-tab refresh coordination — handled inside the SDK; nothing for the React layer to do

The provider + hook live in `src/sparkhub-provider.tsx`. **Copy that one file into your partner app** and you have a complete React integration.

## Run

```bash
npm install
cp .env.example .env.local
# edit .env.local — at minimum set VITE_SPARKHUB_CLIENT_ID

npm run dev
# Vite serves on http://localhost:5173
```

### Local-dev gotchas

- Your registered partner app must have **Allow `localhost` in dev** checked. Without it, SparkHub rejects `http://localhost:5173/` as an invalid redirect URI.
- Set `VITE_SPARKHUB_ORG=<orgcode>` in `.env.local` — SparkHub can't infer the org from `localhost`.
- Open at `http://localhost:5173/` (not `http://<org>.localhost:5173/`).

## Build for production

```bash
npm run build
# dist/ contains the static SPA — deploy to Vercel, Netlify, S3, etc.
```

For a deployable production-shape demo (with Vercel deploy steps and `sparkhub.run` domain binding), see [`sparkhub-partner-app-demo`](https://github.com/KainosSoftwareLtd/sparkhub-partner-app-demo) — vanilla TS variant of the same flow.

## File layout

```
.
├── .env.example
├── index.html
├── package.json
├── README.md
├── src/
│   ├── App.tsx                  # UI
│   ├── main.tsx                 # bootstrap + provider config
│   ├── sparkhub-provider.tsx    # provider + useSparkhub() hook (copy this)
│   └── styles.css
├── tsconfig.json
└── vite.config.ts
```
