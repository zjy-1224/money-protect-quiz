// Service Worker for 赚钱与护钱 PWA
// 策略：HTML 网络优先（保证更新及时），静态资源缓存优先（离线可用）

const CACHE_VERSION = 'v2026.08.17';
const CACHE_NAME = `money-protect-${CACHE_VERSION}`;

// 需要预缓存的核心资源
const PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png'
];

// 安装：预缓存核心资源，跳过等待立即激活
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// 激活：清理旧缓存，立即接管客户端
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith('money-protect-') && name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// 拦截 /_data/ 请求，从 Cache API 返回用户数据（离线/杀后台后仍可恢复）
self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    // 用户数据请求：cache-first（永远从缓存读取）
    if (url.pathname.includes('/_data/')) {
        event.respondWith(
            caches.open('mpq-userdata-v1').then((cache) => {
                return cache.match(request).then((cached) => {
                    return cached || new Response(JSON.stringify({}), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                });
            })
        );
        return;
    }

    const url2 = url;
    if (url2.origin !== self.location.origin) {
        if (url2.hostname.includes('cdn.') || url2.hostname.includes('jsdelivr')) {
            event.respondWith(staleWhileRevalidate(request));
        }
        return;
    }

    if (request.mode === 'navigate' ||
        (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
        event.respondWith(networkFirst(request));
        return;
    }

    event.respondWith(cacheFirst(request));
});

// 网络优先策略（用于 HTML）
async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (err) {
        // 网络失败，使用缓存
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;
        // 如果缓存也没有，返回缓存的首页
        const fallback = await cache.match('./index.html');
        return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });
    }
}

// 缓存优先策略（用于静态资源）
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        // 后台更新缓存
        fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse);
            }
        }).catch(() => {});
        return cachedResponse;
    }
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (err) {
        return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
}

// stale-while-revalidate 策略（用于 CDN 资源）
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch(() => cachedResponse);
    return cachedResponse || fetchPromise;
}

// 监听消息：支持手动触发更新检查
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data === 'CHECK_UPDATE') {
        self.registration.update();
    }
});
