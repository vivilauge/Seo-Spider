#!/usr/bin/env node
/**
 * 修正JSON文件格式：移除文件开头的干扰符号
 * 从旧目录遍历JSON文件，修正后保存到新目录
 */

const fs = require('fs');
const path = require('path');

/**
 * 移除BOM和开头的空白字符
 */
function removeBomAndWhitespace(content) {
  // 移除BOM (Byte Order Mark)
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  
  // 移除开头的空白字符（空格、制表符、换行等）
  content = content.trimStart();
  
  return content;
}

/**
 * 修正单个JSON文件
 */
function fixJsonFile(inputPath, outputPath) {
  try {
    // 读取文件内容
    const content = fs.readFileSync(inputPath, 'utf-8');
    
    // 移除干扰符号
    const cleanedContent = removeBomAndWhitespace(content);
    
    // 验证JSON格式
    try {
      JSON.parse(cleanedContent);
    } catch (e) {
      console.log(`警告: ${inputPath} 的JSON格式可能仍有问题: ${e.message}`);
    }
    
    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 保存修正后的文件
    fs.writeFileSync(outputPath, cleanedContent, 'utf-8');
    
    console.log(`✓ 已修正: ${inputPath} -> ${outputPath}`);
    return true;
    
  } catch (error) {
    console.log(`✗ 处理失败 ${inputPath}: ${error.message}`);
    return false;
  }
}

/**
 * 递归查找所有JSON文件
 */
function findJsonFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findJsonFiles(filePath, fileList);
    } else if (file.endsWith('.json')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

/**
 * 遍历旧目录，处理所有JSON文件
 */
function processDirectory(oldDir, newDir) {
  const oldPath = path.resolve(oldDir);
  const newPath = path.resolve(newDir);
  
  if (!fs.existsSync(oldPath)) {
    console.log(`错误: 旧目录不存在: ${oldDir}`);
    return;
  }
  
  // 查找所有JSON文件
  const jsonFiles = findJsonFiles(oldPath);
  
  if (jsonFiles.length === 0) {
    console.log(`未找到JSON文件在目录: ${oldDir}`);
    return;
  }
  
  console.log(`找到 ${jsonFiles.length} 个JSON文件`);
  console.log('-'.repeat(60));
  
  let successCount = 0;
  jsonFiles.forEach(jsonFile => {
    // 计算相对路径
    const relativePath = path.relative(oldPath, jsonFile);
    
    // 构建新文件路径
    const newFilePath = path.join(newPath, relativePath);
    
    // 处理文件
    if (fixJsonFile(jsonFile, newFilePath)) {
      successCount++;
    }
  });
  
  console.log('-'.repeat(60));
  console.log(`处理完成: ${successCount}/${jsonFiles.length} 个文件成功`);
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  
  let oldDir, newDir;
  
  if (args.length === 2) {
    oldDir = args[0];
    newDir = args[1];
  } else if (args.length === 0) {
    // 默认使用 old 和 new 目录
    const scriptDir = __dirname;
    oldDir = path.join(scriptDir, 'old');
    newDir = path.join(scriptDir, 'new');
    console.log('使用默认目录:');
    console.log(`  旧目录: ${oldDir}`);
    console.log(`  新目录: ${newDir}`);
    console.log();
  } else {
    console.log('用法: node fix_json.js [旧目录] [新目录]');
    console.log('示例: node fix_json.js ./old ./new');
    process.exit(1);
  }
  
  processDirectory(oldDir, newDir);
}

main();

