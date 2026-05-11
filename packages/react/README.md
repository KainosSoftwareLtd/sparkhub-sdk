# `@sparkhub/react`

React bindings for [`@sparkhub/sdk`](../sdk) — Provider, hooks, and components for SparkHub partner apps.

> **Status:** Scaffold only as of v0.2.0. Real exports (`<SparkhubProvider>`, `useSparkhub()`, `<TenantSidebar>`, `<TenantPanel>`) land in v0.3.0 alongside the M2 platform services. See the [M2 design](https://github.com/KainosSoftwareLtd/SparkHub/blob/main/docs/Vibe-Coding-Planning/partner-app/2026-05-11-partner-app-platform-services-design.md) for the planned API.

## Why a separate package

Industry-standard split — `@sparkhub/sdk` is framework-agnostic; `@sparkhub/react` adds React-specific Provider, hooks, and components on top. Same pattern as `@clerk/clerk-js` + `@clerk/clerk-react`, `@stripe/stripe-js` + `@stripe/react-stripe-js`, etc.

Tree-shaking stays clean — vanilla-JS consumers don't pay for React peerDeps.

## Future install (v0.3.0+)

```bash
npm i @sparkhub/sdk @sparkhub/react
```

## License

MIT
