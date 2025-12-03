import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const paths = {
  root: path.resolve(__dirname, '../..'),
  dataDir: path.resolve(__dirname, '../../data'),
  resultsDir: path.resolve(__dirname, '../../results'),
  keywordsFile: path.resolve(__dirname, '../../data/keywords.txt'),
  doneFile: path.resolve(__dirname, '../../data/done.txt'),
};

export function ensureDirs() {
  if (!fs.existsSync(paths.dataDir)) fs.mkdirSync(paths.dataDir, { recursive: true });
  if (!fs.existsSync(paths.resultsDir)) fs.mkdirSync(paths.resultsDir, { recursive: true });
  if (!fs.existsSync(paths.keywordsFile)) fs.writeFileSync(paths.keywordsFile, '', { encoding: 'utf8' });
  if (!fs.existsSync(paths.doneFile)) fs.writeFileSync(paths.doneFile, '', { encoding: 'utf8' });
}

export async function readFirstKeyword() {
  if (!fs.existsSync(paths.keywordsFile)) return null;
  try {
    // 读取文件，尝试多种编码方式
    let content = null;
    let buffer = fs.readFileSync(paths.keywordsFile);
    
    // 检测BOM
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      // UTF-8 BOM，移除BOM标记
      buffer = buffer.slice(3);
      content = buffer.toString('utf8');
    } else {
      // 尝试UTF-8
      try {
        content = buffer.toString('utf8');
        // 检查是否包含乱码字符（如果UTF-8解码失败会有替换字符）
        if (content.includes('\ufffd')) {
          // 包含替换字符，可能是GBK编码，尝试转换
          try {
            const iconvModule = await import('iconv-lite');
            const iconv = iconvModule.default || iconvModule;
            content = iconv.decode(buffer, 'gbk');
          } catch {
            // 如果iconv-lite不可用，尝试gb2312
            try {
              const iconvModule = await import('iconv-lite');
              const iconv = iconvModule.default || iconvModule;
              content = iconv.decode(buffer, 'gb2312');
            } catch {
              // 如果都失败，使用utf8
              content = buffer.toString('utf8');
            }
          }
        }
      } catch {
        // UTF-8解码失败，尝试GBK
        try {
          const iconvModule = await import('iconv-lite');
          const iconv = iconvModule.default || iconvModule;
          content = iconv.decode(buffer, 'gbk');
        } catch {
          content = buffer.toString('utf8');
        }
      }
    }
    
    if (!content) return null;
    
    const lines = content.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    return lines.length > 0 ? lines[0] : null;
  } catch (error) {
    console.error('读取关键词文件失败:', error.message);
    return null;
  }
}

export async function removeFirstKeyword() {
  if (!fs.existsSync(paths.keywordsFile)) return;
  try {
    let buffer = fs.readFileSync(paths.keywordsFile);
    let content = null;
    
    // 检测BOM
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      buffer = buffer.slice(3);
      content = buffer.toString('utf8');
    } else {
      content = buffer.toString('utf8');
      if (content.includes('\ufffd')) {
        // 包含替换字符，尝试GBK
        try {
          const iconvModule = await import('iconv-lite');
          const iconv = iconvModule.default || iconvModule;
          content = iconv.decode(buffer, 'gbk');
        } catch {
          content = buffer.toString('utf8');
        }
      }
    }
    
    if (!content) return;
    
    const lines = content.split(/\r?\n/);
    if (lines.length === 0) return;
    const [, ...rest] = lines;
    // 保存为UTF-8（带BOM，Windows兼容）
    const output = rest.join('\n');
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    fs.writeFileSync(paths.keywordsFile, Buffer.concat([bom, Buffer.from(output, 'utf8')]));
  } catch (error) {
    console.error('移除关键词失败:', error.message);
  }
}

export async function isKeywordDone(keyword) {
  if (!fs.existsSync(paths.doneFile)) return false;
  try {
    let buffer = fs.readFileSync(paths.doneFile);
    let content = null;
    
    // 检测BOM
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      buffer = buffer.slice(3);
      content = buffer.toString('utf8');
    } else {
      content = buffer.toString('utf8');
      if (content.includes('\ufffd')) {
        // 包含替换字符，尝试GBK
        try {
          const iconvModule = await import('iconv-lite');
          const iconv = iconvModule.default || iconvModule;
          content = iconv.decode(buffer, 'gbk');
        } catch {
          content = buffer.toString('utf8');
        }
      }
    }
    
    if (!content) return false;
    return content.split(/\r?\n/).some(line => line.trim() === keyword.trim());
  } catch {
    return false;
  }
}

export async function appendDone(keyword) {
  try {
    let needsNewline = false;
    if (fs.existsSync(paths.doneFile)) {
      let buffer = fs.readFileSync(paths.doneFile);
      let content = null;
      
      // 检测BOM
      if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        buffer = buffer.slice(3);
        content = buffer.toString('utf8');
      } else {
        content = buffer.toString('utf8');
        if (content.includes('\ufffd')) {
          // 包含替换字符，尝试GBK
          try {
            // 动态导入iconv-lite（如果已安装）
            const iconvModule = await import('iconv-lite');
            const iconv = iconvModule.default || iconvModule;
            content = iconv.decode(buffer, 'gbk');
          } catch {
            content = buffer.toString('utf8');
          }
        }
      }
      
      if (content) {
        needsNewline = !content.endsWith('\n');
      }
    }
    
    // 追加时使用UTF-8
    const textToAppend = (needsNewline ? '\n' : '') + keyword + '\n';
    fs.appendFileSync(paths.doneFile, textToAppend, { encoding: 'utf8' });
  } catch (error) {
    console.error('追加done文件失败:', error.message);
  }
}

export function saveResult(keyword, dateStr, data) {
  const safeKeyword = keyword.replace(/[\\/:*?"<>|\n\r]+/g, '_');
  const filename = `${safeKeyword}.json`;
  const dateDir = path.join(paths.resultsDir, dateStr);
  if (!fs.existsSync(dateDir)) fs.mkdirSync(dateDir, { recursive: true });
  const filepath = path.join(dateDir, filename);
  // 使用UTF-8编码保存，不添加BOM（JSON标准不需要BOM）
  const content = JSON.stringify(data, null, 2);
  fs.writeFileSync(filepath, content, { encoding: 'utf8' });
  return filepath;
}


