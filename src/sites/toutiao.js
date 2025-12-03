export async function fetchToutiaoSuggestions(page, keyword) {
  try {
    const url = `https://so.toutiao.com/2/article/search_sug/?keyword=${encodeURIComponent(keyword)}`;
    const res = await page.request.get(url, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'accept-encoding': 'gzip, deflate, br',
        'cache-control': 'no-cache',
        'pragma': 'no-cache',
        'referer': 'https://so.toutiao.com/',
        'origin': 'https://so.toutiao.com',
        'connection': 'keep-alive',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty'
      },
      timeout: 30000,
    });
    if (!res.ok()) return { suggestions: [] };
    const json = await res.json();
    const suggestions = Array.isArray(json?.data)
      ? json.data.map(x => (x?.title || x?.keyword || '').trim()).filter(Boolean)
      : [];
    return { suggestions: suggestions.slice(0, 30) };
  } catch {
    return { suggestions: [] };
  }
}


