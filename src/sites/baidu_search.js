import { humanDelay, detectBaiduCaptcha, waitMinutes, getModuleCookie } from '../utils/antibot.js';

export async function scrapeBaiduSearch(page, keyword) {
  // First visit Baidu homepage to establish session
  try {
    await page.goto('https://www.baidu.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await humanDelay(800, 1500);
    
    // Optional: interact with homepage to look more human-like
    await page.evaluate(() => {
      // Simulate mouse movement
      const event = new MouseEvent('mousemove', {
        clientX: Math.random() * window.innerWidth,
        clientY: Math.random() * window.innerHeight
      });
      document.dispatchEvent(event);
    });
    await humanDelay(400, 800);
    // Captcha detection after homepage
    if (await detectBaiduCaptcha(page)) {
      console.log('检测到百度安全验证（首页），强制退出并休眠 1 分钟');
      throw new Error('CAPTCHA_BAIDUSEARCH_FORCE_RESTART_1M');
    }
  } catch (error) {
    console.log('Warning: Failed to visit Baidu homepage first:', error.message);
  }

  // Get dropdown suggestions using API approach
  const dropdown = await (async () => {
    try {
      const url = `https://www.baidu.com/sugrec?pre=1&p=3&ie=utf-8&json=1&prod=pc&from=pc_web&wd=${encodeURIComponent(keyword)}`;
      const cookie = getModuleCookie('baidu');
      const response = await page.request.get(url, {
        headers: {
          // 通用页面请求头
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'accept-encoding': 'gzip, deflate, br, zstd',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
          'cache-control': 'max-age=0',
          'connection': 'keep-alive',
          'upgrade-insecure-requests': '1',
          // API相关
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'referer': 'https://www.baidu.com/',
          // 可配置 Cookie（环境变量：COOKIE_BAIDU 或 COOKIE_GLOBAL）
          ...(cookie ? { 'cookie': cookie } : {})
        },
        timeout: 10000,
      });
      
      if (response.ok()) {
        const data = await response.json();
        if (data && data.g && Array.isArray(data.g)) {
          return data.g.map(item => item.q || '').filter(Boolean).slice(0, 20);
        }
      }
      return [];
    } catch (error) {
      console.log('Baidu suggestion API error:', error.message);
      return [];
    }
  })();

  // Get related searches from results page
  const related = await (async () => {
    try {
      // Navigate to search results page with retry
      const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(keyword)}`;
      
      try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        if (await detectBaiduCaptcha(page)) {
          console.log('检测到百度安全验证（结果页），强制退出并休眠 1 分钟');
          throw new Error('CAPTCHA_BAIDUSEARCH_FORCE_RESTART_1M');
        }
      } catch (error) {
        console.log('Baidu search page navigation failed:', error.message);
        return [];
      }
      
      await humanDelay(1200, 2000);
      
      // Ensure page context
      try { await page.evaluate(() => document.title); } catch { return []; }
      
      // Scroll and wait a bit to load bottom
      try { await autoScroll(page); } catch {}
      await humanDelay(800, 1200);
      
      // 仅等待底部相关搜索容器
      await page.waitForSelector('#rs, .rs_new, .rs-row_3MUyW, .rs-col_8Qlx-', { timeout: 5000 }).catch(() => {});
      
      const rs = await page.evaluate(() => {
        const results = new Set();
        const addText = (t) => {
          const s = (t || '').trim();
          if (s && s.length > 0 && s.length < 50) results.add(s);
        };
        // 仅底部区域的已知选择器（老/新样式）
        const sels = [
          '#rs a',
          '.rs a',
          'div.rs_new a',
          '.rs-row_3MUyW a',
          '.rs-col_8Qlx- a',
          '.item_3WKCf'
        ];
        sels.forEach(sel => {
          document.querySelectorAll(sel).forEach(a => addText(a.textContent));
        });
        return Array.from(results).slice(0, 20);
      }).catch(() => []);
      
      return rs;
    } catch (error) {
      console.log('Baidu related searches error:', error.message);
      return [];
    }
  })();

  return { dropdown, related };
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const step = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        total += step;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
}


