import { createContext, useContext } from "react";

/**
 * Host-supplied asset-URL resolver — maps a SparkHub KB asset id to a URL the
 * host can actually fetch (typically
 * `${sparkhubBase}/api/public/kb/assets/${assetId}`).
 *
 * Needed because block props carry either BARE asset ids (`fileAsset.assetId`,
 * `drawio.pngAssetId`) or RELATIVE serve paths (`wrappedImage.url`, rewritten
 * to `/api/public/kb/assets/<id>` by SparkHub's public projection) — neither
 * of which resolves from a partner-app origin without the SparkHub base.
 */
export type ResolveAssetUrl = (assetId: string) => string;

export const AssetUrlContext = createContext<ResolveAssetUrl | null>(null);

export function useResolveAssetUrl(): ResolveAssetUrl | null {
  return useContext(AssetUrlContext);
}

/** Trailing `/api/(public/)kb…/assets/<24-hex>` asset id in a serve URL. */
const ASSET_URL_ID_REGEX =
  /\/api\/(?:public\/)?(?:kb|internal\/kb|kb-internal)\/assets\/([a-f0-9]{24})(?:$|[?#])/;

/**
 * Resolve a URL that MAY be a SparkHub asset serve path: when a resolver is
 * present and the URL carries an asset id, resolve through it (so relative
 * public paths work cross-origin); otherwise return the URL untouched.
 */
export function resolveMaybeAssetUrl(url: string, resolve: ResolveAssetUrl | null): string {
  if (!url || !resolve) return url;
  const match = ASSET_URL_ID_REGEX.exec(url);
  return match ? resolve(match[1]) : url;
}
