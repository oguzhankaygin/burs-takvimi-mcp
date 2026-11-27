"use strict";

const CACHE = "burs-takvimi-v2";
const DOSYALAR = ["./index.html", "./style.css", "./app.js", "./lib/takvim.js", "./lib/duyuru.js", "./takvim.json"];
const KOK = new URL("./", self.location.href).href;
const URLLER = DOSYALAR.map(dosya => new URL(dosya, KOK).href);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(DOSYALAR)));
});

self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith("burs-takvimi-") && key !== CACHE)
      .map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  url.search = "";
  const adres = url.href === KOK ? URLLER[0] : url.href;
  if (event.request.method !== "GET" || !URLLER.includes(adres)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (!response.ok) return (await cache.match(adres)) || response;
      try {
        await cache.put(adres, response.clone());
      } catch {
        // Önbellek dolu olsa da ağ yanıtını göster.
      }
      return response;
    } catch {
      return (await cache.match(adres)) || Response.error();
    }
  })());
});
