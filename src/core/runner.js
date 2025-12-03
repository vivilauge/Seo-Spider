import pTimeout from 'p-timeout';

export function createRunner({ chromium, launchOpts, contextRef, hardenContext, humanDelay, waitMinutes }) {
  async function withNewPage(context, stepName, fn) {
    let page = null;
    try {
      page = await context.newPage();
      try { page.setDefaultNavigationTimeout(45000); } catch {}
      try { page.setDefaultTimeout(20000); } catch {}
      try { await page.emulateMedia({ reducedMotion: 'reduce' }); } catch {}
      console.log(`[${stepName}] 开始...`);
      const result = await fn(page);
      console.log(`[${stepName}] 成功完成`);
      return result;
    } catch (e) {
      console.warn(`[${stepName}] 出错：`, e?.message || e);
      throw e;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  async function recreateContext(reason) {
    console.warn(`正在重建浏览器上下文，原因：${reason}`);
    try { await contextRef.context.close(); } catch {}
    if (contextRef.persistent) {
      // 重新创建持久化上下文
      contextRef.context = await chromium.launchPersistentContext(contextRef.userDataDir, { ...launchOpts, ...contextRef.contextOpts });
    } else {
      contextRef.context = await contextRef.browser.newContext(contextRef.contextOpts);
    }
    await hardenContext(contextRef.context);
    console.log('浏览器上下文重建完成');
  }

  async function restartBrowserWithSleep(minutes, reason) {
    console.warn(`检测到需要强制重启浏览器（${reason}），先关闭浏览器再休眠 ${minutes} 分钟...`);
    try { await contextRef.context.close().catch(() => {}); } catch {}
    if (!contextRef.persistent) {
      try { await contextRef.browser.close().catch(() => {}); } catch {}
    }
    await waitMinutes(minutes);
    if (contextRef.persistent) {
      contextRef.context = await chromium.launchPersistentContext(contextRef.userDataDir, { ...launchOpts, ...contextRef.contextOpts });
    } else {
      const newBrowser = await chromium.launch(launchOpts);
      contextRef.browser = newBrowser;
      contextRef.context = await contextRef.browser.newContext(contextRef.contextOpts);
    }
    await hardenContext(contextRef.context);
    console.log('浏览器已重启并重新建立上下文，准备重试');
  }

  async function runStep(stepName, stepFn, _retryOptions = {}) {
    // 单次执行（不再进行任何重试）
    const parsed = parseInt(process.env.STEP_TIMEOUT_MS || '', 10);
    const stepTimeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 90000;
    try {
      const data = await pTimeout(
        withNewPage(contextRef.context, stepName, stepFn),
        { milliseconds: stepTimeoutMs, message: 'STEP_TIMEOUT' }
      );
      return data;
    } catch (e) {
      const errorMsg = String(e?.message || '');

      if (errorMsg.includes('Execution context') || 
          errorMsg.includes('Target closed') || 
          errorMsg.includes('Protocol error') ||
          errorMsg.includes('Session closed')) {
        console.warn(`[${stepName}] 检测到上下文错误，正在重建上下文...`);
        await recreateContext(`${stepName} context lost`);
      }

      if (errorMsg.includes('STEP_TIMEOUT')) {
        console.warn(`[${stepName}] 步骤超时（${stepTimeoutMs}ms），已重建上下文。`);
        await recreateContext(`${stepName} step timeout`);
      }

      if (errorMsg.includes('CAPTCHA_BAIDUSEARCH_FORCE_RESTART_1M')) {
        await restartBrowserWithSleep(1, 'baiduSearch captcha');
        throw new Error('CAPTCHA_ABORT_KEYWORD');
      } else if (errorMsg.includes('CAPTCHA_BAIDUZHIDAO_FORCE_RESTART_1M')) {
        await restartBrowserWithSleep(1, 'zhidao captcha');
        throw new Error('CAPTCHA_ABORT_KEYWORD');
      } else if (errorMsg.includes('CAPTCHA_SOLVE_FAILED_FORCE_RESTART')) {
        await restartBrowserWithSleep(1, 'captcha');
        throw new Error('CAPTCHA_ABORT_KEYWORD');
      }

      // 不进行任何重试，直接抛出供上层处理
      throw e;
    }
  }

  return { runStep, recreateContext, restartBrowserWithSleep };
}


