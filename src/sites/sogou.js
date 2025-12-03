import { humanDelay } from '../utils/antibot.js';

export async function scrapeSogou(page, keyword) {
  // First visit Sogou homepage to establish session
  try {
    await page.goto('https://www.sogou.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  } catch (error) {
    console.log('Warning: Failed to visit Sogou homepage first:', error.message);
  }

  // Step 1: Click input box and type keyword to get dropdown suggestions
  const dropdown = await (async () => {
    try {
      // Wait for page to be fully loaded
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      
      // Find and click the search input
      const inputSelectors = [
        'input#query',
        'input[name="query"]',
        'input[placeholder*="搜索"]',
        'input[placeholder*="搜狗"]',
        '.search-input'
      ];
      
      let input = null;
      for (const selector of inputSelectors) {
        try {
          input = page.locator(selector).first();
          await input.waitFor({ state: 'visible', timeout: 3000 });
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!input) {
        console.log('Could not find Sogou search input');
        return [];
      }
      
      // Scroll to input and click
      await input.scrollIntoViewIfNeeded();
      await humanDelay(200, 500);
      await input.click({ delay: 100 });
      await humanDelay(300, 600);
      
      // Clear any existing text and type the keyword
      await input.fill('', { timeout: 5000 });
      await humanDelay(200, 400);
      await input.type(keyword, { delay: 100 });
      await humanDelay(800, 1500);
      
      // Wait for suggestions to appear (longer + retries with ArrowDown)
      await page.waitForSelector('.sbox-sugg-item, #suglist li, .suglist li, .sug-words li', { timeout: 8000 }).catch(() => {});
      
      // If still no suggestion container, try to nudge UI
      const hasSug = await page.evaluate(() => !!document.querySelector('.sbox-sugg-item, #suglist li, .suglist li, .sug-words li')).catch(() => false);
      if (!hasSug) {
        try { await page.keyboard.press('ArrowDown'); } catch {}
        await humanDelay(300, 600);
        try { await page.waitForSelector('.sbox-sugg-item, #suglist li, .suglist li, .sug-words li', { timeout: 3000 }); } catch {}
      }
      
      // Extract dropdown suggestions
      const texts = await page.evaluate(() => {
        const out = new Set();
        const sels = [
          // New Sogou selectors
          '.sbox-sugg-item',
          '.sbox-sugg-item.sbox-text-ellipsis',
          // Legacy selectors
          '#suglist li',
          '.suglist li', 
          '.sug-words li',
          '.sug-list li',
          '.suggestion li'
        ];
        for (const sel of sels) {
          document.querySelectorAll(sel).forEach(el => {
            const t = (el.textContent || '').trim();
            if (t && t.length > 0 && t.length < 50) out.add(t);
          });
        }
        return Array.from(out);
      });
      
      const list = texts.slice(0, 20);
      try { console.log(`[sogou] 下拉抓取 ${list.length} 条`); } catch {}
      return list;
    } catch (error) {
      console.log('Sogou dropdown error:', error.message);
      return [];
    }
  })();

  // Step 2: Press Enter to search and get related keywords from results page
  const related = await (async () => {
    try {
      // Press Enter to search（确保输入框仍在焦点）
      await page.keyboard.press('Enter');
      await humanDelay(1000, 2000);
      
      // Wait for results
      try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch {}
      await humanDelay(1200, 1800);
      
      // Validate context
      try { await page.evaluate(() => document.title); } catch { return []; }
      
      // Scroll to bottom to reveal related sections
      try { await autoScroll(page); } catch {}
      await humanDelay(800, 1200);
      
      // Try to wait for possible related containers
      await page.waitForSelector('#hint_container, .hintBox, .top-hint, .related-search, .hint-list, .related-keywords, [aria-label*="相关搜索" i]', { timeout: 8000 }).catch(() => {});
      
      const rs = await page.evaluate(() => {
        const results = new Set();
        const add = (t) => {
          const s = (t || '').trim();
          if (s && s.length > 0 && s.length < 50) results.add(s);
        };
        // Headline-based container search
        const containers = Array.from(document.querySelectorAll('div, section, aside'))
          .filter(el => /相关搜索/.test((el.innerText || '').slice(0, 60)));
        containers.forEach(c => c.querySelectorAll('a').forEach(a => add(a.textContent)));
        
        // Known selectors
        const sels = [
          '#hint_container a',
          '.hintBox .hint a',
          '.top-hint a',
          '.related-search a',
          '.hint-list a',
          '.related-keywords a',
          '.vrwrap .hint a',
          '.footer .hint a'
        ];
        sels.forEach(sel => {
          document.querySelectorAll(sel).forEach(a => add(a.textContent));
        });
        
        return Array.from(results).slice(0, 20);
      }).catch(() => []);
      
      try { console.log(`[sogou] 底部相关抓取 ${rs.length} 条`); } catch {}
      return rs;
    } catch (error) {
      console.log('Sogou related searches error:', error.message);
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


