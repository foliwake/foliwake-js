// Media URLs in a body, channel-aware (design §9.3). The engine writes `/media/<sha256>.<ext>`.
//  - live, with `app.media.transform: "cloudflare-images"`: Cloudflare Images on `app.media.base`
//    (ported from Gaiare's media-url.ts: width from the srcset descriptor, the largest one or 1448 for src);
//  - live otherwise: `<proxies.media>/<key>`;
//  - preview: always `<proxies.media>/preview/<key>` (never the public media host: an unpublished picture
//    is fetched only through the app's authorisation).
import type { ChannelName } from '@foliwake/blocks-contract/page';
import type { FoliwakeAppSettings } from './config.js';
import { srcsetCandidates } from './html.js';

// `.svg`: inline reference images (engine content-components.md §3.7); never transformed.
const ENGINE_MEDIA = /^\/media\/([0-9a-f]{64}\.(?:png|jpe?g|webp|gif|avif|svg))$/;
const TRANSFORMABLE = /\.(?:png|jpe?g|webp|gif)$/;
const TRANSFORM_OPTIONS = 'format=auto,quality=80,metadata=none';
const WIDTH = /^(\d{1,5})w$/;
const MAX_WIDTH = 4096;
const DEFAULT_SRC_WIDTH = 1448;

export interface MediaRewriter {
  url(value: string, width?: number | null): string;
  srcset(value: string): string;
  /** The `src` of an <img>, given its srcset (for the transform width). */
  src(value: string, srcset: string | undefined): string;
}

export function mediaRewriter(app: FoliwakeAppSettings, channel: ChannelName): MediaRewriter {
  const proxied = (key: string) => (channel === 'preview' ? `${app.proxies.media}/preview/${key}` : `${app.proxies.media}/${key}`);
  const transform = channel === 'live' && app.media?.transform === 'cloudflare-images' ? app.media.base : null;
  const url = (value: string, width?: number | null): string => {
    const match = ENGINE_MEDIA.exec(value);
    if (!match) return value;
    const key = match[1]!;
    if (transform && TRANSFORMABLE.test(key) && width && Number.isInteger(width) && width >= 1 && width <= MAX_WIDTH) {
      return `${transform}/cdn-cgi/image/width=${width},${TRANSFORM_OPTIONS}/media/${key}`;
    }
    return proxied(key);
  };
  const largest = (srcset: string): number | null => {
    const widths = srcsetCandidates(srcset).map((c) => WIDTH.exec(c.descriptor)).filter((m) => m !== null).map((m) => Number(m![1]));
    return widths.length ? Math.max(...widths) : null;
  };
  return {
    url,
    srcset: (value) =>
      srcsetCandidates(value)
        .map(({ url: u, descriptor }) => {
          const w = WIDTH.exec(descriptor);
          const out = url(u, w ? Number(w[1]) : null);
          return descriptor ? `${out} ${descriptor}` : out;
        })
        .join(', '),
    src: (value, srcset) => url(value, (srcset ? largest(srcset) : null) ?? DEFAULT_SRC_WIDTH),
  };
}
