import { humanDelay, detectBaiduCaptcha, waitMinutes, getModuleCookie } from '../utils/antibot.js';

export async function scrapeBaiduZhidao(page, keyword) {
  // 1) 打开百度知道首页
  try {
    try {
      const ck = getModuleCookie('zhidao');
      if (ck) await page.setExtraHTTPHeaders({ cookie: ck });
    } catch {}
    await page.goto('https://zhidao.baidu.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await humanDelay(800, 1200);
    if (await detectBaiduCaptcha(page)) {
      console.log('检测到百度安全验证（知道首页），强制退出并休眠 1 分钟');
      throw new Error('CAPTCHA_BAIDUZHIDAO_FORCE_RESTART_1M');
    }
  } catch (e) {
    console.log('访问百度知道首页失败：', e.message);
    return { relatedSearches: [], items: [] };
  }
  // 2) 在首页内执行搜索输入与提交（不再直达结果页）

  const zhidaoPage = page;

  // 第四步：在百度知道页面搜索关键词（强化输入框定位与交互）
  let usedQuery = keyword;
  let submitted = false;
  
  // 等待页面稳定
  await humanDelay(800, 1200);
  try {
    // 等待页面加载完成
    await zhidaoPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await humanDelay(800, 1200);

    // 直接等待输入框ID：kw
    console.log('等待输入框 #kw 出现...');
    let inputHandle = await zhidaoPage.waitForSelector('#kw', { 
      timeout: 10000,
      state: 'visible'
    }).catch(() => null);
    
    // 兜底：多选择器尝试
    if (!inputHandle) {
      const altSelectors = ['input[name="word"]', 'input[type="search"]', 'input[autocomplete="off"]', 'form input'];
      for (const sel of altSelectors) {
        inputHandle = await zhidaoPage.$(sel);
        if (inputHandle && (await inputHandle.isVisible().catch(() => false))) { console.log(`使用备用选择器 ${sel}`); break; }
        inputHandle = null;
      }
      if (!inputHandle) {
        console.log('警告：无法找到输入框（#kw 或备用选择器）');
        return { relatedSearches: [], items: [] };
      }
    }

    // 执行输入和提交
    try {
      console.log('开始输入关键词...');
      // 滚动到输入框可见区域，并移动鼠标模拟人工
      await inputHandle.scrollIntoViewIfNeeded().catch(() => {});
      await humanDelay(100, 200);
      try {
        const box = await inputHandle.boundingBox();
        if (box) {
          await zhidaoPage.mouse.move(box.x + box.width/2, box.y + box.height/2, { steps: 8 });
          await humanDelay(120, 260);
        }
      } catch {}
      
      // 点击输入框
      await inputHandle.click({ delay: 80 });
      await humanDelay(150, 250);
      
      // 清空并输入（放慢节奏）
      await inputHandle.fill(' ');
      await humanDelay(120, 240);
      await inputHandle.fill('');
      await inputHandle.type(keyword, { delay: 90 });
      await humanDelay(200, 400);
      
      console.log(`已输入关键词：${keyword}，当前URL：${await zhidaoPage.url()}`);

      // 优先通过“搜索答案”按钮提交
      const btnSelectors = ['#search-btn', 'button[type="submit"]', 'input[type="submit"]', 'button'];
      let btnHandle = null;
      for (const sel of btnSelectors) {
        const h = await zhidaoPage.$(sel);
        if (h && (await h.isVisible().catch(() => false))) { btnHandle = h; break; }
      }
      if (btnHandle) {
        // 鼠标移动到按钮再点击
        try {
          const box = await btnHandle.boundingBox();
          if (box) { await zhidaoPage.mouse.move(box.x + box.width/2, box.y + box.height/2, { steps: 6 }); await humanDelay(120, 220); }
        } catch {}
        await btnHandle.click({ delay: 100 });
      } else {
        console.log('未找到按钮，回退回车提交');
        await zhidaoPage.keyboard.press('Enter');
      }

      // 等待页面导航或结果加载
      await Promise.race([
        zhidaoPage.waitForURL(u => /search\?word=/.test(String(u)), { timeout: 10000 }).catch(() => {}),
        zhidaoPage.waitForSelector('.question-list, #w-question-list, .search-list, .qb-list, .list .dl', { timeout: 10000 }).catch(() => {})
      ]);

      // 等待网络空闲，确保内容完全加载
      await zhidaoPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await humanDelay(1500, 2200);

      // 检查是否有结果容器
      const hasResultsNow = await zhidaoPage.evaluate(() => !!document.querySelector('.question-list, #w-question-list, .search-list, .qb-list, .list .dl')).catch(() => false);
      if (hasResultsNow) {
        submitted = true;
        console.log(`搜索提交成功，已找到结果容器，当前URL：${await zhidaoPage.url()}`);
      } else {
        const checkResult = await zhidaoPage.evaluate(() => {
          const bodyText = (document.body?.innerText || '').toLowerCase();
          return /抱歉[，,]?未找到相关结果|未找到相关结果/.test(bodyText);
        }).catch(() => false);
        if (checkResult) {
          console.log('检测到"未找到相关结果"，该关键词无内容');
          return { relatedSearches: [], items: [] };
        }
        submitted = true;
        console.log('搜索提交完成');
      }
    } catch (error) {
      console.log('输入或提交过程出错：', error.message);
    }
  } catch (error) {
    console.log('在百度知道搜索关键词失败：', error.message);
  }

  // 不再使用直达URL兜底，全部以模拟人工方式；若仍未提交则继续返回空结果

  // 等待结果容器与至少一个条目出现
  try {
    await zhidaoPage.waitForSelector('.question-list, #w-question-list, .search-list, .qb-list, .list .dl', { timeout: 8000 });
    await zhidaoPage.waitForSelector('.question-list .question-list-item a, #w-question-list .question-item a, .search-list .list-item a, .qb-list .dl a, .list .dl a', { timeout: 8000 });
    console.log('找到结果容器与首条内容');
  } catch {
    console.log('未找到结果容器或首条内容，继续尝试提取');
  }

  // 有内容后滚动到底部以加载更多，再提取
  try { 
    await autoScroll(zhidaoPage);
    await humanDelay(600, 900);
    console.log('滚动到底部完成');
  } catch (e) { 
    console.log('滚动失败：', e.message); 
  }

  // 等待相关区域（抖动与节流）
  await humanDelay(300, 800);
  await zhidaoPage.waitForSelector('[aria-label*="相关搜索" i], .rw-item, .related-search, #rs', { timeout: 5000 }).catch(() => {});

  // 提取相关搜索
  await humanDelay(300, 800);
  const relatedSearches = await zhidaoPage.evaluate(() => {
    try {
      const texts = new Set();
      const add = (t) => {
        const s = (t || '').trim();
        if (s && s.length <= 40 &&
            !s.includes('下一页') && !s.includes('尾页') && !s.includes('上一页') &&
            !s.includes('首页') && !s.includes('全部') &&
            !s.includes('最近一周') && !s.includes('最近一月') && !s.includes('最近一年') &&
            !/^\d+$/.test(s)) {
          texts.add(s);
        }
      };

      // 查找包含"相关搜索"的容器
      const containers = Array.from(document.querySelectorAll('div, section, aside'))
        .filter(el => /相关搜索/.test((el.innerText || '').slice(0, 60)));
      containers.forEach(c => c.querySelectorAll('a').forEach(a => add(a.textContent)));

      const candidates = [
        '.rw-item',
        '.c-span4.c-line-clamp1.rw-item',
        'a[href^="/search?word="]',
        '#rs a',
        '.related a',
        '.relevant a',
        '.rs a',
        '.related-search a',
      ];
      for (const sel of candidates) {
        document.querySelectorAll(sel).forEach(a => add(a.textContent));
      }
      return Array.from(texts).slice(0, 20);
    } catch (error) {
      console.log('提取相关搜索出错：', error.message);
      return [];
    }
  }).catch(() => []);

  // 提取内容列表
  await humanDelay(300, 800);
  const items = await zhidaoPage.evaluate(() => {
    try {
      function pick(el, sel) {
        const n = el.querySelector(sel);
        return n ? (n.textContent || '').trim() : '';
      }
      function pickAttr(el, sel, attr) {
        const n = el.querySelector(sel);
        return n ? (n.getAttribute(attr) || '').trim() : '';
      }
      const results = [];
      const containers = document.querySelectorAll([
        '.question-list .question-list-item',
        '#w-question-list .question-item',
        '.search-list .list-item',
        '.qb-list .dl',
        '.list .dl',
        '.question-list li',
        '.w-question-list .list',
        '.question-item',
        '.q-item'
      ].join(','));
      
      console.log(`找到 ${containers.length} 个结果容器`);
      
      containers.forEach(el => {
        const title = pick(el, 'a.question-title, a.title, h2, .title a, .question-title a, a');
        const url = pickAttr(el, 'a.question-title, a.title, a', 'href');
        const content = pick(el, '.answer, .summary, .content, .desc, .question-content, .best-text, .con');
        const time = pick(el, '.time, .q-time, .ctl, .ask-date, .dt, .question-time, .news-time');
        
        const authorSelectors = [
          '.f-lighter.nod',
          '.author', '.user', '.name', '.asker', '.question-author',
          '.answer-author', '.user-name', '.username', '.author-name',
          '.ti-author', '.answer-user', '.reply-author'
        ];
        let author = '';
        for (const sel of authorSelectors) {
          author = pick(el, sel);
          if (author) break;
        }
        if (title) results.push({ title, url, content, time, author });
      });
      return results.slice(0, 20);
    } catch (error) {
      console.log('提取内容列表出错：', error.message);
      return [];
    }
  }).catch(() => []);

  console.log(`提取到 ${relatedSearches.length} 个相关搜索，${items.length} 个内容条目`);

  return {
    relatedSearches,
    items,
  };
}

// 直接访问搜索结果页（仅使用原始关键词）
export async function scrapeBaiduZhidaoLoop(page, keyword, variants = []) {
  // 打开首页一次
  try {
    await page.goto('https://zhidao.baidu.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await humanDelay(600, 900);
    if (await detectBaiduCaptcha(page)) {
      console.log('检测到百度安全验证（知道首页），将强制退出并休眠 1 分钟');
      throw new Error('CAPTCHA_SOLVE_FAILED_FORCE_RESTART');
    }
  } catch {}
  
  try {
    // 增加每页显示数量，获取更多内容（最多50条）
    const url = `https://zhidao.baidu.com/search?lm=0&rn=50&pn=0&fr=search&dyTabStr=null&word=${encodeURIComponent(keyword)}&t=${Date.now()}`;
    console.log(`[zhidao] 正在访问搜索页...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await humanDelay(500, 800);
    
    if (await detectBaiduCaptcha(page)) {
      console.log('检测到百度安全验证（知道搜索页），强制退出并休眠 1 分钟');
      throw new Error('CAPTCHA_BAIDUZHIDAO_FORCE_RESTART_1M');
    }
    
    // 等待内容加载
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await humanDelay(800, 1200);
    
    // 判空
    const noResult = await page.evaluate(() => {
      try {
        const text = (document.body?.innerText || '').toLowerCase();
        return /抱歉[，,]?未找到相关结果|未找到相关结果/.test(text);
      } catch { return false; }
    }).catch(() => false);
    
    if (noResult) {
      console.log(`[zhidao] 无结果：${keyword}`);
      return { relatedSearches: [], items: [] };
    }
    
    // 滚动页面以加载所有懒加载的内容
    console.log(`[zhidao] 开始滚动加载内容...`);
    try {
      await autoScroll(page);
      await humanDelay(1000, 1500);
      console.log(`[zhidao] 滚动完成，等待内容完全加载...`);
    } catch (e) {
      console.log(`[zhidao] 滚动失败：${e.message}`);
    }
    
    // 再次等待网络空闲，确保所有内容加载完成
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await humanDelay(800, 1200);
    
    // 提取相关搜索
    console.log(`[zhidao] 开始提取相关搜索...`);
    await humanDelay(300, 800);
    const relatedSearches = await page.evaluate(() => {
      try {
        const texts = new Set();
        const add = (t) => {
          const s = (t || '').trim();
          if (s && s.length <= 40 &&
              !s.includes('下一页') && !s.includes('尾页') && !s.includes('上一页') &&
              !s.includes('首页') && !s.includes('全部') &&
              !s.includes('最近一周') && !s.includes('最近一月') && !s.includes('最近一年') &&
              !/^\d+$/.test(s)) {
            texts.add(s);
          }
        };
        const containers = Array.from(document.querySelectorAll('div, section, aside'))
          .filter(el => /相关搜索/.test((el.innerText || '').slice(0, 60)));
        containers.forEach(c => c.querySelectorAll('a').forEach(a => add(a.textContent)));
        const candidates = ['.rw-item', '.c-span4.c-line-clamp1.rw-item', 'a[href^="/search?word="]', '#rs a', '.related a', '.relevant a', '.rs a', '.related-search a'];
        for (const sel of candidates) document.querySelectorAll(sel).forEach(a => add(a.textContent));
        return Array.from(texts);
      } catch { return []; }
    }).catch(() => []);
    
    // 提取内容列表（移除所有数量限制，抓取第一页所有内容）
    console.log(`[zhidao] 开始提取内容列表...`);
    await humanDelay(300, 800);
    const items = await page.evaluate(() => {
      try {
        function pick(el, sel) {
          const n = el.querySelector(sel);
          return n ? (n.textContent || '').trim() : '';
        }
        function pickAttr(el, sel, attr) {
          const n = el.querySelector(sel);
          return n ? (n.getAttribute(attr) || '').trim() : '';
        }
        
        const results = [];
        // 扩大选择器范围，确保覆盖所有可能的列表项
        const selectors = [
          '.question-list .question-list-item',
          '#w-question-list .question-item',
          '.search-list .list-item',
          '.qb-list .dl',
          '.list .dl',
          '.question-list li',
          '.w-question-list .list',
          '.question-item',
          '.q-item',
          '.question-list-item',
          '.list-item',
          'dl.dl',
          '.list dl',
          '.qb-list dl'
        ];
        
        const containers = document.querySelectorAll(selectors.join(','));
        
        containers.forEach((el, index) => {
          try {
            // 标题选择器（优先级从高到低）
            const titleSelectors = [
              'a.question-title',
              'a.title',
              'h2',
              '.title a',
              '.question-title a',
              'h3',
              'dt a',
              'a[href*="/question/"]',
              'a'
            ];
            
            let title = '';
            for (const sel of titleSelectors) {
              title = pick(el, sel);
              if (title && title.length > 0) break;
            }
            
            if (!title) return; // 没有标题跳过此项
            
            // URL选择器
            const urlSelectors = [
              'a.question-title',
              'a.title',
              'a[href*="/question/"]',
              'a'
            ];
            
            let url = '';
            for (const sel of urlSelectors) {
              url = pickAttr(el, sel, 'href');
              if (url && url.length > 0) break;
            }
            
            // 先获取整个元素的文本内容，然后从文本中提取"问："和"答："部分
            const fullText = el.innerText || el.textContent || '';
            let question = '';
            let answer = '';
            
            // 尝试从整体文本中提取"问："和"答："部分（优先方法）
            // 使用 [\s\S] 代替 . 以匹配包括换行符在内的所有字符
            const questionMatch = fullText.match(/问[：:][\s\n]*([\s\S]+?)(?=答[：:]|$)/);
            if (questionMatch && questionMatch[1]) {
              question = questionMatch[1].trim();
            }
            
            const answerMatch = fullText.match(/答[：:][\s\n]*([\s\S]+?)(?=问[：:]|$)/);
            if (answerMatch && answerMatch[1]) {
              answer = answerMatch[1].trim();
            }
            
            // 如果从文本中没有提取到，尝试通过选择器提取
            if (!question) {
              const questionSelectors = [
                '.question',
                '.question-text',
                '.question-content',
                '.ask',
                '.ask-text',
                '.q-content',
                '.question-detail',
                'dd.question',
                '.detail .question',
                'p.question',
                '.content .question'
              ];
              
              for (const sel of questionSelectors) {
                const text = pick(el, sel);
                if (text && text.trim().length > 0) {
                  // 如果文本中包含"问："，提取后面的内容
                  const match = text.match(/问[：:][\s\n]*([\s\S]+)/);
                  if (match && match[1]) {
                    question = match[1].trim();
                  } else {
                    question = text.trim();
                  }
                  if (question) break;
                }
              }
            }
            
            if (!answer) {
              const answerSelectors = [
                '.answer',
                '.best-text',
                '.answer-text',
                '.best-answer',
                '.answer-content',
                '.summary',
                '.content',
                '.desc',
                '.con',
                '.detail',
                'dd',
                'p'
              ];
              
              for (const sel of answerSelectors) {
                const text = pick(el, sel);
                if (text && text.trim().length > 0) {
                  // 如果文本中包含"答："，提取后面的内容
                  const match = text.match(/答[：:][\s\n]*([\s\S]+)/);
                  if (match && match[1]) {
                    answer = match[1].trim();
                  } else {
                    // 如果选择器选择的元素在"答："之后，直接使用
                    const parentText = el.innerText || '';
                    if (parentText.indexOf('答：') !== -1 && parentText.indexOf(text) > parentText.indexOf('答：')) {
                      answer = text.trim();
                    }
                  }
                  if (answer) break;
                }
              }
            }
            
            // 合并问题和答案内容
            let content = '';
            if (question && answer) {
              content = `问：${question}\n答：${answer}`;
            } else if (question) {
              content = `问：${question}`;
            } else if (answer) {
              content = `答：${answer}`;
            } else {
              // 如果都没有找到，尝试提取整个文本内容（去除标题和无关内容）
              const cleanText = fullText.trim();
              if (cleanText.length > 0) {
                // 移除标题部分（通常标题在开头）
                const titleInText = cleanText.indexOf(title);
                const remainingText = titleInText !== -1 
                  ? cleanText.substring(titleInText + title.length).trim()
                  : cleanText;
                
                if (remainingText.length > 0) {
                  content = remainingText;
                } else {
                  content = cleanText;
                }
              }
            }
            
            // 时间选择器
            const timeSelectors = [
              '.time',
              '.q-time',
              '.ctl',
              '.ask-date',
              '.dt',
              '.question-time',
              '.news-time',
              '.date',
              'span.time'
            ];
            
            let time = '';
            for (const sel of timeSelectors) {
              time = pick(el, sel);
              if (time && time.length > 0) break;
            }
            
            // 作者选择器
            const authorSelectors = [
              '.f-lighter.nod',
              '.author',
              '.user',
              '.name',
              '.asker',
              '.question-author',
              '.answer-author',
              '.user-name',
              '.username',
              '.author-name',
              '.ti-author',
              '.answer-user',
              '.reply-author',
              '.user-info'
            ];
            
            let author = '';
            for (const sel of authorSelectors) {
              author = pick(el, sel);
              if (author && author.length > 0) break;
            }
            
            results.push({ title, url, content, time, author });
          } catch (err) {
            // 单个项提取失败，继续处理下一个
          }
        });
        
        // 去重（根据标题）
        const uniqueResults = [];
        const seenTitles = new Set();
        for (const item of results) {
          const titleKey = item.title.toLowerCase().trim();
          if (!seenTitles.has(titleKey)) {
            seenTitles.add(titleKey);
            uniqueResults.push(item);
          }
        }
        
        return uniqueResults;
      } catch (error) {
        return [];
      }
    }).catch(() => []);
    
    console.log(`[zhidao] 提取完成：相关搜索 ${relatedSearches.length} 个，内容列表 ${items.length} 条`);
    
    // 验证返回数据的完整性
    if (!relatedSearches || !Array.isArray(relatedSearches)) {
      console.warn(`[zhidao] 警告：relatedSearches 格式不正确`);
      relatedSearches = [];
    }
    if (!items || !Array.isArray(items)) {
      console.warn(`[zhidao] 警告：items 格式不正确`);
      items = [];
    }
    
    const result = { relatedSearches, items };
    console.log(`[zhidao] 返回数据结构：relatedSearches=${result.relatedSearches.length} 项, items=${result.items.length} 项`);
    return result;
  } catch (e) {
    console.error(`[zhidao] 执行出错：${keyword} -> ${e?.message || e}`);
    // 即使出错也返回空数据，而不是抛出异常，这样至少能保存部分结果
    // 但如果是验证码错误，应该抛出以触发重启
    if (e?.message?.includes('CAPTCHA_')) {
      throw e;
    }
    // 其他错误返回空数据
    return { relatedSearches: [], items: [] };
  }
}

async function autoScroll(page) {
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
}