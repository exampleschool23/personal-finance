import vinext from "vinext";
import { createConnection, createServer, type AddressInfo } from "node:net";
import { defineConfig, type Plugin } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  main: "vinext/server/fetch-handler",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

// macOS AirPlay Receiver listens on port 5000 too. Vite binds "localhost" to ::1
// only, so a browser that reconnects over 127.0.0.1 gets AirPlay's 403 for the
// stylesheets and scripts and the page stays unstyled on "Loading your
// workspace…". Answer on the IPv4 loopback as well by forwarding it to Vite.
function ipv4LoopbackForwarder(): Plugin {
  return {
    name: "ipv4-loopback-forwarder",
    apply: "serve",
    configureServer(server) {
      const http = server.httpServer;
      http?.once("listening", () => {
        const { address, port } = http.address() as AddressInfo;
        if (address !== "::1") return;
        const forwarder = createServer((client) => {
          const upstream = createConnection({ host: "::1", port });
          client.pipe(upstream).pipe(client);
          client.on("error", () => upstream.destroy());
          upstream.on("error", () => client.destroy());
        });
        forwarder.on("error", (error) =>
          server.config.logger.warn(`127.0.0.1:${port} unavailable: ${error.message}`));
        forwarder.listen(port, "127.0.0.1");
        http.once("close", () => forwarder.close());
      });
    },
  };
}

export default defineConfig(async () => {
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(!managedLinux ? { port: 5000, strictPort: true } : {}),
      ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      ...(!managedLinux ? [ipv4LoopbackForwarder()] : []),
      vinext(),
      sites({ mockAuth: !managedLinux }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
