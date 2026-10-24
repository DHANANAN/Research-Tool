/* Public application shell only. Research records live in per-user IndexedDB. */
// Vite replaces this marker for every build. A failed update must never write
// into the currently active worker's cache.
const SHELL_CACHE = "research-tool-shell-__RESEARCH_BUILD_ID__";
const SHELL_FILES = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
  "/icon-192.png",
  "/icon-512.png",
];

function isPublicAsset(url) {
  return (
    url.origin === self.location.origin &&
    !url.search &&
    (SHELL_FILES.includes(url.pathname) ||
      /^\/assets\/[\w./-]+\.(?:js|css|woff2?|svg|png|webp|jpg|jpeg)$/.test(
        url.pathname,
      ))
  );
}

async function publicResponse(path) {
  const response = await fetch(path, { cache: "reload", credentials: "omit" });
  if (!response.ok)
    throw new Error(`Unable to prepare offline application shell: ${path}`);
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const index = await publicResponse("/");
      const html = await index.clone().text();
      await cache.put("/", index.clone());
      await cache.put("/index.html", index);
      const assets = new Set(
        SHELL_FILES.filter((path) => path !== "/" && path !== "/index.html"),
      );
      for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        const url = new URL(match[1], self.location.origin);
        if (isPublicAsset(url)) assets.add(url.pathname);
      }
      await Promise.all(
        [...assets].map(async (path) => {
          await cache.put(path, await publicResponse(path));
        }),
      );
      // Do not force an update while a field worker is entering answers.
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith("research-tool-shell-") && name !== SHELL_CACHE,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never intercept API calls, credentials, uploads, or cross-origin traffic.
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    url.search
  )
    return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (!response.ok) throw new Error("Navigation unavailable");
          return response;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const response = await cache.match("/");
          return (
            response ||
            new Response(
              "Offline application is not ready. Open Research-Tool online once before collecting offline.",
              {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              },
            )
          );
        }
      })(),
    );
    return;
  }

  if (!isPublicAsset(url)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(event.request);
      // Hashed build assets are immutable; cached shell assets are a safe offline fallback.
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok && response.type !== "opaque")
        await cache.put(event.request, response.clone());
      return response;
    })(),
  );
});
