# Seo-Spider

关键词驱动的爬虫程序，使用 Playwright，按顺序抓取：

- 百度知道：第一页列表（标题、内容、时间、作者）+ 相关搜索
- 百度搜索：下拉联想 + 底部相关搜索
- 今日头条：搜索联想 API（纯 API）
- 百度站内搜索：API（纯 API）
- 搜狗搜索：下拉联想 + 相关搜索

抓取结果按关键词分别保存为 JSON 文件，保存到日期目录：`results/<日期>/<关键词>.json`。完成后将关键词记录到 `data/done.txt`，并从 `data/keywords.txt` 中删除。

## 准备

1) 安装依赖
```bash
npm install
```

2) 安装 Playwright 浏览器（如提示缺少）
```bash
npx playwright install
```

3) 准备数据文件
```bash
mkdir -p data results
# 初始化示例
printf "示例关键词1\n示例关键词2\n" > data/keywords.txt
: > data/done.txt
```

## 运行

### Windows系统

推荐使用启动脚本，自动设置UTF-8编码：
```cmd
start.bat
```

或者手动设置编码后运行：
```cmd
chcp 65001
npm start
```

### macOS/Linux

- 连续处理关键词（直到 `data/keywords.txt` 为空）：
```bash
npm start
```

- 仅处理首个关键词进行测试：
```bash
npm run start:once
```

## 环境变量

### 环境变量与参数一览

- `HEADFUL=0`：关闭有头模式（默认开启有头模式）。在Windows上默认开启有头模式，避免字体乱码问题。
- `SLOWMO_MS=300`：放慢操作节奏（毫秒）。配合 HEADFUL 观察更清晰。
- `PROXY=http://user:pass@host:port`：全局代理（可选）。
- `KEYWORDS_LIMIT=1`：限制本次运行最多处理的关键词数（0 或不设为不限）。
- `ONLY=zhidao|baidu|toutiao|zhannei|sogou`：仅运行指定模块（不设则全部）。
- `RESET_DONE=1`：启动前清空 `data/done.txt`，便于重复测试。
- `BETWEEN_KEYWORDS_MS=2000`：关键词之间的基础等待（毫秒），建议在高频下调大到 3000+。

说明：
- 反爬与验证码（统一策略）：
  - 一旦检测到验证码：立刻关闭浏览器并休眠 1 分钟，中止当前关键词；主循环等待后继续下一个关键词。
  - 页面使用“隐私窗口”（非持久化上下文），每个关键词新建浏览器/上下文，结束后立即关闭。
- 性能与稳定：
  - 全局禁载图片/媒体/字体，启用 reduced-motion，减少动画与渲染开销。
  - 关键步骤加入 300–800ms 抖动；关键词之间可由 `BETWEEN_KEYWORDS_MS` 控制（建议 2–3s+）。

## 浏览器调试模式

### 开启有头模式（推荐用于调试）
```bash
# 有头模式运行，可以看到浏览器窗口
HEADFUL=1 npm start

# 有头模式 + 慢速操作（便于观察）
HEADFUL=1 SLOWMO_MS=1000 npm start

# 仅处理一个关键词进行调试
HEADFUL=1 KEYWORDS_LIMIT=1 npm start
```

### 调试技巧
1. **观察抓取过程**：有头模式下可以实时看到浏览器操作
2. **检查页面结构**：如果抓取失败，可以手动访问页面查看选择器
3. **网络请求监控**：在浏览器开发者工具中查看API请求
4. **慢速模式**：`SLOWMO_MS=1000` 让操作更慢，便于观察

### 常见问题调试
- 如果某个站点抓取失败，检查 `src/sites/` 目录下对应文件的选择器
- 网络问题可以尝试设置代理：`PROXY=http://proxy:port npm start`
- 反爬检测可以尝试更换浏览器：修改 `src/main.js` 中的 `browserType`

## 结果结构

每个关键词一个 JSON 文件，示例（保存在 `results/<日期>/<关键词>.json`）：
```json
{
  "keyword": "示例关键词1",
  "date": "20251029",
  "sources": {
    "baiduZhidao": {
      "relatedSearches": [""],
      "items": [
        {"title": "", "content": "", "time": "", "author": "", "url": ""}
      ]
    },
    "baiduSearch": {
      "dropdown": [""],
      "related": [""]
    },
    "toutiao": {"suggestions": [""]},
    "baiduZhannei": {"items": [{"title": "", "url": "", "snippet": ""}]},
    "sogou": {
      "dropdown": [""],
      "related": [""]
    }
  }
}
```

## 当前实现状态

### ✅ 已正常工作的模块与要点
- **百度知道**
  - 流程：打开首页 → 直接访问搜索结果页（附 `t=时间戳`）→ 若“未找到相关结果”则视为空 → 否则提取
  - 验证码：检测到即关闭浏览器并休眠 1 分钟，中止该关键词
- **百度搜索**
  - 下拉与相关均使用原始关键词
  - 验证码：检测到即关闭并休眠 1 分钟
- **今日头条**：纯 API；补充完整浏览器风格请求头
- **百度站内搜索**：纯 API；补充 Referer/Origin、Sec-Fetch-* 等请求头并过滤无效标题
- **搜狗搜索**
  - 下拉与相关均使用原始关键词
  - 通过轻微键盘操作与滚动提升下拉/底部相关曝光率

### 🔧 技术实现
- **防爬机制**: 先访问首页建立会话，模拟真实用户行为
- **百度搜索**: 使用API获取下拉建议，通过搜索结果页面获取相关搜索
- **搜狗搜索**: 采用真实用户行为（点击输入框→输入关键词→获取下拉→按回车→获取相关搜索）

## 注意
- 仅跑某模块示例：
```bash
# 百度知道
echo "测试关键词" > data/keywords.txt
RESET_DONE=1 ONLY=zhidao HEADFUL=1 SLOWMO_MS=300 KEYWORDS_LIMIT=1 npm start

# 百度搜索
RESET_DONE=1 ONLY=baidu HEADFUL=1 KEYWORDS_LIMIT=1 npm start

# 搜狗
RESET_DONE=1 ONLY=sogou HEADFUL=1 KEYWORDS_LIMIT=1 npm start

# 今日头条（API）
RESET_DONE=1 ONLY=toutiao KEYWORDS_LIMIT=1 npm start

# 百度站内（API）
RESET_DONE=1 ONLY=zhannei KEYWORDS_LIMIT=1 npm start
```
- 站点结构可能更新，若选择器失效可在对应 `src/sites/*.js` 中调整。
- 本项目仅供学习研究，请遵守目标网站的服务条款与法律法规。
