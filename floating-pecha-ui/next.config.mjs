/** @type {import('next').NextConfig} */
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Wires the Cloudflare bindings (D1 `DB`, R2 `MEDIA`, etc.) into
// `getCloudflareContext()` during plain `next dev`, reading the local
// miniflare state under `.wrangler/state`. Without this, routes that call
// getCloudflareContext (e.g. /api/search) throw under `next dev` and only work
// under `npm run dev:cf`. Note: `next dev` still does NOT load `.dev.vars`, so
// auth (AUTH_SECRET) needs `npm run dev:cf` for full sign-in.
initOpenNextCloudflareForDev();

const nextConfig = {
  /* config options here */
  output: 'standalone',
};

export default nextConfig;
