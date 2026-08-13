// Service Worker for 赚钱与护钱 PWA
// 策略：HTML 网络优先（保证更新及时），静态资源缓存优先（离线可用）

const CACHE_VERSION = 'v2026.08.13b';
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

// 请求拦截
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // 只处理 GET 请求
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // 跳过跨域请求（如 CDN 资源），让浏览器直接处理
    if (url.origin !== self.location.origin) {
        // CDN 资源用 stale-while-revalidate
        if (url.hostname.includes('cdn.') || url.hostname.includes('jsdelivr')) {
            event.respondWith(staleWhileRevalidate(request));
        }
        return;
    }

    // HTML 导航请求：网络优先（确保用户获取最新版本）
    if (request.mode === 'navigate' ||
        (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
        event.respondWith(networkFirst(request));
        return;
    }

    // 其他同源静态资源：缓存优先
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
