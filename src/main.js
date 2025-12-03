import { chromium } from 'playwright';
import { execSync } from 'child_process';

// Windows字体乱码修复：设置UTF-8编码
if (process.platform === 'win32') {
  // 设置控制台输出编码为UTF-8
  try {
    // 执行chcp命令设置控制台代码页为UTF-8
    execSync('chcp 65001 >nul 2>&1', { stdio: 'ignore', shell: true });
  } catch {}
  
  // 设置环境变量确保使用UTF-8
  process.env.CHCP = '65001';
  
  // 确保stdout和stderr使用UTF-8
  try {
    if (process.stdout && typeof process.stdout.setDefaultEncoding === 'function') {
      process.stdout.setDefaultEncoding('utf8');
    }
    if (process.stderr && typeof process.stderr.setDefaultEncoding === 'function') {
      process.stderr.setDefaultEncoding('utf8');
    }
  } catch {}
}
import { format } from 'date-fns';
import fs from 'fs';
import path from 'path';
import { ensureDirs, readFirstKeyword, removeFirstKeyword, isKeywordDone, appendDone, saveResult, paths } from './utils/file.js';
import { launchOptionsFromEnv, contextOptionsFromEnv, hardenContext, humanDelay, waitMinutes, USER_AGENTS } from './utils/antibot.js';
import { createRunner } from './core/runner.js';
import { scrapeBaiduZhidao } from './sites/baidu_zhidao.js';
import { scrapeBaiduSearch } from './sites/baidu_search.js';
import { fetchToutiaoSuggestions } from './sites/toutiao.js';
import { fetchBaiduZhannei } from './sites/baidu_zhannei.js';
import { scrapeSogou } from './sites/sogou.js';

async function runOnce(contextRef, launchOpts) {
  ensureDirs();
  const keyword = await readFirstKeyword();
  if (!keyword) {
    console.log('data/keywords.txt 中没有可用关键词');
    return false;
  }
  
  // Skip empty keywords
  if (keyword.trim() === '') {
    console.log('跳过空关键词，已从队列移除');
    await removeFirstKeyword();
    return true;
  }
  
  if (await isKeywordDone(keyword)) {
    console.log(`已处理过：${keyword}，从队列中移除`);
    await removeFirstKeyword();
    return true;
  }

  console.log(`\n=== 正在处理关键词：${keyword} ===`);
  const dateStr = format(new Date(), 'yyyyMMdd');
  const contextOpts = contextRef?.contextOpts || contextOptionsFromEnv();

  // 关闭 UA 打印日志

  // 使用传入的持久化上下文
  if (!contextRef || !contextRef.context) {
    throw new Error('上下文未初始化');
  }
  const runner = createRunner({ chromium, launchOpts, contextRef, hardenContext, humanDelay, waitMinutes });
  const { runStep } = runner;

  // 运行器负责页面与上下文管理

  const result = {
    keyword,
    date: dateStr,
    sources: {
      baiduZhidao: { relatedSearches: [], items: [] },
      baiduSearch: { dropdown: [], related: [] },
      toutiao: { suggestions: [] },
      baiduZhannei: { items: [] },
      sogou: { dropdown: [], related: [] },
    },
  };

  // 检查数据是否为空或质量过低
  function isDataEmpty(data, stepName) {
    if (!data) return true;
    const name = String(stepName || '').toLowerCase();
    const key = name.startsWith('baidusearch') ? 'baiduSearch'
             : name.startsWith('baiduzhidao') ? 'baiduZhidao'
             : name.startsWith('baiduzhannei') ? 'baiduZhannei'
             : name.startsWith('sogou') ? 'sogou'
             : name.startsWith('toutiao') ? 'toutiao'
             : name;
    switch (key) {
      case 'baiduZhidao':
        return (!data.relatedSearches || data.relatedSearches.length === 0) && 
               (!data.items || data.items.length === 0);
      case 'baiduSearch':
        return (!data.dropdown || data.dropdown.length === 0) && 
               (!data.related || data.related.length === 0);
      case 'toutiao':
        return !data.suggestions || data.suggestions.length === 0;
      case 'baiduZhannei':
        return !data.items || data.items.length === 0;
      case 'sogou':
        return (!data.dropdown || data.dropdown.length === 0) && 
               (!data.related || data.related.length === 0);
      default:
        return true;
    }
  }

  // runStep 已由 core/runner 提供

  // 若只测试某一模块，通过环境变量控制
  const only = (process.env.ONLY || '').toLowerCase();

  try {
    // 1. 百度搜索
    if (!only || only === 'baidu') {
      const baiduSearchInitial = await runStep('baiduSearch-初始', p => scrapeBaiduSearch(p, keyword));
      const initDd = Array.isArray(baiduSearchInitial?.dropdown) ? baiduSearchInitial.dropdown : [];
      const initRel = Array.isArray(baiduSearchInitial?.related) ? baiduSearchInitial.related : [];
      result.sources.baiduSearch = {
        dropdown: initDd,
        related: initRel
      };
      try {
        const ddCount = Array.isArray(result.sources.baiduSearch?.dropdown) ? result.sources.baiduSearch.dropdown.length : 0;
        const relCount = Array.isArray(result.sources.baiduSearch?.related) ? result.sources.baiduSearch.related.length : 0;
        console.log(`[baiduSearch] 下拉：${ddCount}，相关搜索：${relCount}`);
      } catch {}
      await humanDelay(1000, 2000);
      if (only === 'baidu') {
        const filepath = saveResult(keyword, dateStr, result);
        console.log(`已保存：${filepath}`);
        await appendDone(keyword);
        await removeFirstKeyword();
        return true;
      }
    }

    // 2. 搜狗
    if (!only || only === 'sogou') {
      const sogouRes = await runStep('sogou', p => scrapeSogou(p, keyword));
      const initDd = Array.isArray(sogouRes?.dropdown) ? sogouRes.dropdown : [];
      const initRel = Array.isArray(sogouRes?.related) ? sogouRes.related : [];
      result.sources.sogou = {
        dropdown: initDd,
        related: initRel
      };
      try {
        const ddCount = Array.isArray(result.sources.sogou?.dropdown) ? result.sources.sogou.dropdown.length : 0;
        const relCount = Array.isArray(result.sources.sogou?.related) ? result.sources.sogou.related.length : 0;
        console.log(`[sogou] 下拉：${ddCount}，相关搜索：${relCount}`);
      } catch {}
      if (only === 'sogou') {
        const filepath = saveResult(keyword, dateStr, result);
        console.log(`已保存：${filepath}`);
        await appendDone(keyword);
        await removeFirstKeyword();
        return true;
      }
    }

    // 3. 百度知道
    if (!only || only === 'zhidao') {
      try {
        const zhidaoRes = await runStep('baiduZhidao', p => scrapeBaiduZhidao(p, keyword));
        if (zhidaoRes) {
          result.sources.baiduZhidao = zhidaoRes;
          const relCount = Array.isArray(result.sources.baiduZhidao?.relatedSearches) ? result.sources.baiduZhidao.relatedSearches.length : 0;
          const itemCount = Array.isArray(result.sources.baiduZhidao?.items) ? result.sources.baiduZhidao.items.length : 0;
          console.log(`[baiduZhidao] 提取成功：相关搜索 ${relCount} 个，内容条目 ${itemCount} 条`);
          
          // 如果有内容，确保保存
          if (relCount > 0 || itemCount > 0) {
            console.log(`[baiduZhidao] 检测到内容，将保存数据`);
          } else {
            console.log(`[baiduZhidao] 警告：提取结果为空`);
          }
        } else {
          console.log(`[baiduZhidao] 警告：runStep 返回空值`);
          result.sources.baiduZhidao = { relatedSearches: [], items: [] };
        }
      } catch (error) {
        console.error(`[baiduZhidao] 抓取出错：${error?.message || error}`);
        // 即使出错也要确保有默认值，避免后续保存失败
        result.sources.baiduZhidao = { relatedSearches: [], items: [] };
        throw error; // 重新抛出，让上层处理
      }
      
      await humanDelay(1000, 2000);
      if (only === 'zhidao') {
        const filepath = saveResult(keyword, dateStr, result);
        console.log(`已保存：${filepath}`);
        await appendDone(keyword);
        await removeFirstKeyword();
        return true;
      }
    }
    // 4. 今日头条联想（API）
    if (!only || only === 'toutiao') {
      const toutiaoRes = await runStep('toutiao', p => fetchToutiaoSuggestions(p, keyword), { 
        retries: 2, factor: 1.5, minTimeout: 600 
      });
      result.sources.toutiao = {
        ...(toutiaoRes || { suggestions: [] })
      };
      try {
        const sugCount = Array.isArray(result.sources.toutiao?.suggestions) ? result.sources.toutiao.suggestions.length : 0;
        console.log(`[toutiao] 相关搜索：${sugCount}`);
      } catch {}
      await humanDelay(800, 1500);
      if (only === 'toutiao') {
        const filepath = saveResult(keyword, dateStr, result);
        console.log(`已保存：${filepath}`);
        await appendDone(keyword);
        await removeFirstKeyword();
        return true;
      }
    }

    // 5. 百度站内搜索
    if (!only || only === 'zhannei') {
      const zhanneiRes = await runStep('baiduZhannei', p => fetchBaiduZhannei(p, keyword), {
        retries: 4, factor: 2.0, minTimeout: 1000
      });
      result.sources.baiduZhannei = {
        ...(zhanneiRes || { items: [] })
      };
      try {
        const itemCount = Array.isArray(result.sources.baiduZhannei?.items) ? result.sources.baiduZhannei.items.length : 0;
        console.log(`[baiduZhannei] 结果条目：${itemCount}`);
      } catch {}
      await humanDelay(800, 1500);
      if (only === 'zhannei') {
        const filepath = saveResult(keyword, dateStr, result);
        console.log(`已保存：${filepath}`);
        await appendDone(keyword);
        await removeFirstKeyword();
        return true;
      }
    }

    // 默认：全部跑完后保存
    const filepath = saveResult(keyword, dateStr, result);
    console.log(`已保存：${filepath}`);
    await appendDone(keyword);
    await removeFirstKeyword();
    return true;
  } catch (e) {
    console.error('处理关键词出错：', keyword, e?.message || e);
    throw e;
  }
}

async function main() {
  const limit = Number(process.env.KEYWORDS_LIMIT || '0');
  const betweenKeywords = Number(process.env.BETWEEN_KEYWORDS_MS || '2000') || 2000;
  let processed = 0;
  let consecutiveFailures = 0;
  
  console.log(`启动爬虫，限制数量：${limit || '不限'}`);

  // 测试模式：重置 done 文件
  if (process.env.RESET_DONE === '1') {
    try {
      ensureDirs();
      fs.writeFileSync(paths.doneFile, '');
      console.log('已重置 data/done.txt');
    } catch (e) {
      console.log('重置 done 文件失败：', e?.message || e);
    }
  }
  
  // 初始化单实例浏览器（持久化上下文，非隐私窗口）
  const launchOpts = launchOptionsFromEnv();
  const contextOpts = contextOptionsFromEnv();
  const userDataDir = path.resolve(paths.root, '.user-data');
  let context = await chromium.launchPersistentContext(userDataDir, { ...launchOpts, ...contextOpts });
  await hardenContext(context);
  const contextRef = { browser: null, context, contextOpts, persistent: true, userDataDir };
  const runner = createRunner({ chromium, launchOpts, contextRef, hardenContext, humanDelay, waitMinutes });

  while (true) {
    try {
      const had = await runOnce(contextRef, launchOpts);
      if (!had) {
        console.log('没有更多关键词可处理');
        break;
      }
      
      processed += 1;
      consecutiveFailures = 0; // Reset failure counter on success
      console.log(`\n✅ 已成功处理 ${processed} 个关键词`);
      
      if (limit > 0 && processed >= limit) {
        console.log(`已达到限制：${limit} 个关键词`);
        break;
      }
      
      // Longer delay between keywords to avoid rate limiting
      const delay = betweenKeywords + Math.random() * 1000;
      console.log(`等待 ${Math.round(delay)}ms 后处理下一个关键词...`);
      await humanDelay(delay, delay + 500);
      
    } catch (error) {
      consecutiveFailures++;
      console.error(`\n❌ 处理关键词出错（连续失败 ${consecutiveFailures}）：`, error?.message || error);
      // 如果是验证码中止，强制等待 1 分钟再继续
      const msg = String(error?.message || error || '');
      if (msg.includes('CAPTCHA_ABORT_KEYWORD')) {
        const cool = 1 * 60 * 1000;
        console.log(`检测到验证码中止，本关键词已终止。等待 1 分钟后继续...`);
        await humanDelay(cool, cool + 500);
        continue;
      }
      
      // Exponential backoff on failures
      const backoffDelay = Math.min(5000 * Math.pow(2, consecutiveFailures - 1), 30000);
      console.log(`等待 ${backoffDelay}ms 后重试...`);
      await humanDelay(backoffDelay, backoffDelay + 1000);
    }
  }

  // 永不停止模式：如果没有更多关键词则退出；否则持续运行
  console.log(`\n爬虫循环结束。本轮处理 ${processed} 个关键词。`);
  try { await context.close(); } catch {}
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


