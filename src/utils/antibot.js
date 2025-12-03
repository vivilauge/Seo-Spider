import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const USER_AGENTS = [
  // Windows Chrome (recent versions)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  // macOS Chrome
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  // Linux Chrome
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

export function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function randomViewport() {
  const widths = [1280, 1366, 1440, 1536, 1600, 1920];
  const heights = [720, 768, 800, 900, 1080];
  const w = widths[Math.floor(Math.random() * widths.length)];
  const h = heights[Math.floor(Math.random() * heights.length)];
  return { width: w, height: h };
}

export function randomLocale() {
  const locales = ['zh-CN', 'zh'];
  return locales[Math.floor(Math.random() * locales.length)];
}

export async function hardenContext(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    const original = Notification && Notification.permission;
    try { Object.defineProperty(Notification, 'permission', { get: () => original || 'default' }); } catch {}
    const wopen = window.open;
    if (wopen && typeof wopen === 'function') {
      try { window.open = new Proxy(wopen, { apply: (t, thisArg, args) => Reflect.apply(t, thisArg, args) }); } catch {}
    }

    // 假定减弱动效偏好，尽量减少动画渲染
    try {
      const origMatch = window.matchMedia;
      window.matchMedia = (query) => {
        if (typeof query === 'string' && /prefers-reduced-motion\s*:\s*reduce/i.test(query)) {
          return { matches: true, media: query, addListener: () => {}, removeListener: () => {}, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
        }
        return origMatch ? origMatch(query) : { matches: false, media: query };
      };
    } catch {}

    // 页面级样式禁用动画与平滑滚动
    document.addEventListener('DOMContentLoaded', () => {
      try {
        const style = document.createElement('style');
        style.setAttribute('data-disable-animations', '1');
        style.textContent = '*,*::before,*::after{animation: none !important; transition: none !important; scroll-behavior: auto !important;} html{scroll-behavior:auto !important;}';
        document.head && document.head.appendChild(style);
      } catch {}
    }, { once: true });
  });

  // 全局拦截图片/媒体/字体，减少网络与渲染开销
  try {
    await context.route('**/*', (route) => {
      try {
        const req = route.request();
        const type = req.resourceType();
        if (type === 'image' || type === 'media' || type === 'font') return route.abort();
        const url = req.url();
        if (/\.(?:png|jpe?g|gif|webp|svg|ico|mp4|webm|woff2?|ttf)(?:\?|$)/i.test(url)) return route.abort();
      } catch {}
      return route.continue();
    });
  } catch {}
}

export async function humanDelay(minMs = 200, maxMs = 800) {
  // 原始区间抖动
  const baseDelta = Math.random() * Math.max(0, (maxMs - minMs));
  const baseMs = Math.floor(minMs + baseDelta);
  // 额外人类停顿：+2s ~ +5s，更加随机，模拟观察/思考
  const extraMs = 2000 + Math.floor(Math.random() * 3000);
  const total = baseMs + extraMs;
  await new Promise(r => setTimeout(r, total));
}

export async function waitMinutes(minutes = 5) {
  const ms = Math.max(0, Math.floor(minutes * 60 * 1000));
  await new Promise(r => setTimeout(r, ms));
}

export async function detectBaiduCaptcha(page) {
  try {
    // Quick checks: title and common texts
    const title = await page.title().catch(() => '');
    if (title && /安全验证|百度安全/i.test(title)) return true;

    const hasCaptcha = await page.evaluate(() => {
      const text = (document.body.innerText || '').slice(0, 2000);
      const keywords = [
        '安全验证', '输入验证码', '请点击验证', '百度安全', '为了确保您的正常使用',
      ];
      const selCandidates = [
        '#verify-form', '.captcha', '.vcode-spin', '.yidun', 'img[src*="captcha"]',
        '.verify', '.nc-container', '#captcha', 'iframe[src*="safeverify"]'
      ];
      const hasKeyword = keywords.some(k => text.includes(k));
      const hasSel = selCandidates.some(s => document.querySelector(s));
      return hasKeyword || hasSel;
    }).catch(() => false);
    return !!hasCaptcha;
  } catch {
    return false;
  }
}

export function launchOptionsFromEnv() {
  // 默认开启有头模式，Windows上更好显示
  const headful = process.env.HEADFUL === '0' ? false : true;
  const slowMo = Number(process.env.SLOWMO_MS || '0') || 0;
  const proxy = process.env.PROXY ? { server: process.env.PROXY } : undefined;
  return { headless: !headful, slowMo, proxy };
}

export function contextOptionsFromEnv() {
  return {
    userAgent: randomUserAgent(),
    locale: randomLocale(),
    timezoneId: 'Asia/Shanghai',
    viewport: randomViewport(),
    // Windows字体乱码修复：确保使用UTF-8字符集
    acceptDownloads: false,
    // 确保浏览器上下文使用UTF-8编码
    extraHTTPHeaders: {
      // 按需发送常见页面请求头（覆盖默认，提升稳定性）
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
      'cache-control': 'max-age=0',
      'connection': 'keep-alive',
      'upgrade-insecure-requests': '1'
    }
  };
}

// 获取模块专用 Cookie：优先 COOKIE_<MODULE>，其次 COOKIE_GLOBAL
export function getModuleCookie(moduleKey) {
  try {
    // 1) 优先从 data/cookies.json 或 data/cookies.txt 读取
    const ck = getCookieFromFile(moduleKey);
    if (ck) return ck;
    // 2) 退回到环境变量
    const key = String(moduleKey || '').toUpperCase();
    const specific = process.env[`COOKIE_${key}`];
    if (specific && typeof specific === 'string' && specific.trim()) return specific.trim();
    const globalCk = process.env.COOKIE_GLOBAL || process.env.COOKIE || '';
    return (typeof globalCk === 'string' ? globalCk : '').trim();
  } catch { return ''; }
}

// 内部：从文件读取 Cookie（支持 JSON 或 简单KV）
let _cookiesCache = null;
let _cookiesMtime = 0;
function readCookiesConfig() {
  try {
    const cwd = process.cwd();
    const candidates = [
      path.resolve(cwd, 'data', 'cookies.json'),
      path.resolve(cwd, 'data', 'cookies.txt')
    ];
    for (const fp of candidates) {
      if (fs.existsSync(fp)) {
        const stat = fs.statSync(fp);
        if (_cookiesCache && _cookiesMtime === stat.mtimeMs) return _cookiesCache;
        const raw = fs.readFileSync(fp, 'utf8');
        let obj = {};
        if (fp.endsWith('.json')) {
          try { obj = JSON.parse(raw || '{}') || {}; } catch { obj = {}; }
        } else {
          // 解析简单的 KEY=VALUE 行；
          // 如果整行不包含 '='，视为直接粘贴的浏览器 Cookie 字符串，作为全局 cookie 使用
          let hasKV = false;
          let firstRaw = '';
          raw.split(/\r?\n/).forEach(line => {
            const s = line.trim();
            if (!s || s.startsWith('#')) return;
            const idx = s.indexOf('=');
            if (idx > 0) {
              const k = s.slice(0, idx).trim();
              const v = s.slice(idx + 1).trim();
              if (k) { obj[k] = v; hasKV = true; }
            } else if (!firstRaw) {
              firstRaw = s; // 记录第一行原始 Cookie
            }
          });
          if (!hasKV && firstRaw) {
            obj.global = firstRaw;
          }
        }
        _cookiesCache = obj;
        _cookiesMtime = stat.mtimeMs;
        return _cookiesCache;
      }
    }
    return {};
  } catch { return {}; }
}

function getCookieFromFile(moduleKey) {
  try {
    const config = readCookiesConfig();
    if (!config || typeof config !== 'object') return '';
    // 支持 keys：global/cookie、baidu、zhidao、zhannei（大小写不敏感）
    const mapKey = (k) => String(k || '').toLowerCase();
    const table = {};
    Object.keys(config).forEach(k => { table[mapKey(k)] = String(config[k] ?? '').trim(); });
    const mk = mapKey(moduleKey);
    if (mk && table[mk]) return table[mk];
    // 常见别名
    if (mk === 'baidu' && table['search']) return table['search'];
    if (mk === 'zhidao' && table['know'] ) return table['know'];
    if (mk === 'zhannei' && table['site'] ) return table['site'];
    // 全局
    return table['global'] || table['cookie'] || '';
  } catch { return ''; }
}


