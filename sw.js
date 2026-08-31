/* Minimal service worker — its ONLY real job is to make "Add to Home
   Screen" available (Android Chrome requires a registered service worker
   with a fetch handler before it will show the install prompt).

   IMPORTANT — this is deliberately NOT a full offline-caching service
   worker. This app runs live tests with a timer, admin approval, and
   real-time Firebase data — serving even one student a cached, out-of-date
   copy of index.html during/just before a test (e.g. right after you push
   a bug fix) could hand them stale logic mid-exam. So every request is
   tried on the network FIRST; the cache is only a fallback for the rare
   case the network request fails (e.g. a brief connection drop), not the
   primary source. Firebase's own realtime connection (websocket) is not
   affected by this at all — the browser handles that separately, outside
   any fetch this service worker sees.

   { cache: "no-store" } / { cache: "reload" } on every fetch below is
   deliberate: a plain fetch() still honors the BROWSER's own HTTP cache
   (based on the server's Cache-Control headers), so a "network-first" SW
   without this could still silently hand back a stale, browser-HTTP-cached
   copy of index.html without ever actually reaching the server — making
   this whole service worker's freshness guarantee meaningless. This is
   what let one student's phone keep running an old, already-fixed-on-the-
   server build while a different device on the same login loaded fine.
*/
const CACHE_NAME = "vision-academy-shell-v1";
const SHELL_FILES = ["./index.html", "./manifest.json", "./logo.png"];

self.addEventListener("install", event => {
  // Take over immediately on the very next load instead of waiting for
  // every open tab to be closed first — so a pushed fix reaches students
  // as fast as possible.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(SHELL_FILES.map(url =>
        fetch(url, { cache: "reload" })
          .then(res => cache.put(url, res))
          .catch(()=>{})
      ))
    ).catch(()=>{})
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      // Drop any older cache version from a previous deploy.
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", event => {
  // Only handle simple same-origin GETs (page/CSS/image/script style
  // requests). Anything else — Firebase's own network calls in particular
  // — is left completely untouched, going straight to the network exactly
  // as if this service worker didn't exist.
  if(event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(()=>{});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
