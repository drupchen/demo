import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";

export default defineCloudflareConfig({
  // Defaults are fine for this project. Future additions: incremental cache,
  // tag cache, queue — only when needed.
});
