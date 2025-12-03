import { humanDelay, detectBaiduCaptcha, getModuleCookie } from '../utils/antibot.js';

export async function fetchBaiduZhannei(page, keyword) {
  try {
    // 使用新的接口URL
    const url = `https://zhannei.baidu.com/cse/site?q=${encodeURIComponent(keyword)}&click=1&cc=baijiahao.baidu.com&s=&nsid=`;
    console.log(`[baiduZhannei] 正在访问 URL：${url}`);
    
    // 访问页面
    try {
      const ck = getModuleCookie('zhannei');
      if (ck) await page.setExtraHTTPHeaders({ cookie: ck });
    } catch {}
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await humanDelay(800, 1200);
    
    // 检测验证码
    if (await detectBaiduCaptcha(page)) {
      console.log('检测到百度安全验证（站内搜索页），强制退出并休眠 1 分钟');
      throw new Error('CAPTCHA_BAIDUSEARCH_FORCE_RESTART_1M');
    }
    
    // 等待内容加载
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await humanDelay(1000, 1500);
    
    // 滚动页面以加载所有内容
    console.log(`[baiduZhannei] 开始滚动加载内容...`);
    try {
      await page.evaluate(async () => {
        await new Promise(resolve => {
          let total = 0;
          const distance = 400;
          const timer = setInterval(() => {
            const { scrollHeight } = document.scrollingElement || document.documentElement;
            window.scrollBy(0, distance);
            total += distance;
            if (total >= scrollHeight - window.innerHeight - 200) {
              clearInterval(timer);
              resolve();
            }
          }, 200);
        });
      });
      await humanDelay(1000, 1500);
      console.log(`[baiduZhannei] 滚动完成`);
    } catch (e) {
      console.log(`[baiduZhannei] 滚动失败：${e.message}`);
    }
    
    // 再次等待网络空闲
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await humanDelay(800, 1200);
    
    // 提取第一页的所有内容（标题和全部内容）
    console.log(`[baiduZhannei] 开始提取内容...`);
    const items = await page.evaluate(() => {
      try {
        const results = [];
        
        // 尝试多种选择器来查找结果项
        const selectors = [
          '.result-item',
          '.c-container',
          '.result',
          '.search-result-item',
          '.item',
          '.t',
          '[data-click]',
          '.c-title-text',
          '.c-title',
          'h3 a',
          '.f13 a',
          '.f13'
        ];
        
        let containers = [];
        for (const sel of selectors) {
          containers = Array.from(document.querySelectorAll(sel));
          if (containers.length > 0) {
            break;
          }
        }
        
        // 如果没有找到特定的容器，尝试查找所有包含链接的元素
        if (containers.length === 0) {
          // 查找所有可能的结果区域
          const possibleAreas = document.querySelectorAll('div[class*="result"], div[class*="item"], div[class*="c-container"], li[class*="result"], li[class*="item"]');
          containers = Array.from(possibleAreas);
        }
        
        // 去重：通过链接URL
        const seenUrls = new Set();
        
        containers.forEach((el, index) => {
          try {
            // 提取标题
            const titleSelectors = [
              'h3 a',
              '.c-title-text',
              '.c-title',
              'a.c-title-text',
              'a.title',
              'h3',
              '.t a',
              'a'
            ];
            
            let title = '';
            let url = '';
            
            for (const sel of titleSelectors) {
              const titleEl = el.querySelector(sel);
              if (titleEl) {
                title = (titleEl.textContent || titleEl.innerText || '').trim();
                url = titleEl.getAttribute('href') || '';
                if (title && url) break;
              }
            }
            
            // 如果标题选择器没找到，尝试从整个元素提取
            if (!title) {
              title = (el.textContent || el.innerText || '').trim().split('\n')[0].trim();
              const link = el.querySelector('a');
              if (link) {
                url = link.getAttribute('href') || '';
                if (!title) title = (link.textContent || link.innerText || '').trim();
              }
            }
            
            // 处理相对URL
            if (url && url.startsWith('/')) {
              url = 'https://zhannei.baidu.com' + url;
            }
            
            if (!title || !url) return; // 跳过没有标题或URL的项
            
            // 去重
            const urlKey = url.toLowerCase();
            if (seenUrls.has(urlKey)) return;
            seenUrls.add(urlKey);
            
            // 提取全部内容
            const contentSelectors = [
              '.c-abstract',
              '.c-span9',
              '.abstract',
              '.summary',
              '.content',
              '.desc',
              '.snippet',
              '.c-content',
              '.c-gap-top-small'
            ];
            
            let content = '';
            for (const sel of contentSelectors) {
              const contentEl = el.querySelector(sel);
              if (contentEl) {
                content = (contentEl.textContent || contentEl.innerText || '').trim();
                if (content) break;
              }
            }
            
            // 如果内容选择器没找到，尝试从整个元素提取（排除标题）
            if (!content) {
              const titleEl = el.querySelector('h3, .c-title, .t, a.title');
              if (titleEl) {
                titleEl.remove();
              }
              const allText = (el.textContent || el.innerText || '').trim();
              // 移除标题部分
              content = allText.replace(title, '').trim();
            }
            
            // 过滤无效结果
            if (!title || title.length < 2) return;
            if (title.includes('百度一下') || title.includes('移动首页')) return;
            if (url.includes('index.htm') || url.includes('index.html')) return;
            
            results.push({
              title,
              url,
              snippet: content || ''
            });
          } catch (err) {
            // 单个项提取失败，继续处理下一个
          }
        });
        
        return results;
      } catch (error) {
        return [];
      }
    });
    
    // 过滤掉标题包含"百度"或"无标题文档"的结果
    const filteredItems = items.filter(i => 
      i.title && 
      !i.title.includes('百度') && 
      !i.title.includes('无标题文档')
    );
    
    console.log(`[baiduZhannei] 提取完成：原始结果 ${items.length} 条，过滤后 ${filteredItems.length} 条`);
    return { items: filteredItems };
  } catch (error) {
    console.error('[baiduZhannei] 整体执行出错：', error.message);
    return { items: [] };
  }
}


