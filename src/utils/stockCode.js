/**
 * 股票代码工具函数
 * 处理股票代码的标准化和验证
 */

/**
 * 标准化股票代码
 * 将各种格式的输入转换为标准格式：sh600519, sz000001
 * @param {string} input - 股票代码或名称
 * @returns {string|null} 标准化的股票代码，如 sh600519，失败返回null
 */
function normalizeStockCode(input) {
  if (!input || typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // 1. 带市场前缀的完整代码，如 sh600519, sz000001
  const prefixMatch = trimmed.match(/^(sh|sz|bj)([0-9]{4,6})$/i);
  if (prefixMatch) {
    const market = prefixMatch[1].toLowerCase();
    const code = prefixMatch[2].padStart(6, "0");
    return `${market}${code}`;
  }

  // 2. 纯数字代码，默认上交所
  if (trimmed.match(/^[0-9]{6}$/)) {
    return `sh${trimmed}`;
  }

  // 3. 4-5位数字代码，补齐为6位
  if (trimmed.match(/^[0-9]{4,5}$/)) {
    return `sh${trimmed.padStart(6, "0")}`;
  }

  return null;
}

/**
 * 验证股票代码格式
 * @param {string} code - 股票代码
 * @returns {boolean} 是否为有效格式
 */
function isValidStockCode(code) {
  if (!code || typeof code !== "string") {
    return false;
  }
  return /^(sh|sz|bj)[0-9]{6}$/i.test(code);
}

/**
 * 从完整代码中提取市场代码
 * @param {string} fullCode - 完整代码，如 sh600519
 * @returns {string|null} 市场代码，如 sh
 */
function getMarket(fullCode) {
  if (!isValidStockCode(fullCode)) {
    return null;
  }
  return fullCode.substring(0, 2).toLowerCase();
}

/**
 * 从完整代码中提取股票代码
 * @param {string} fullCode - 完整代码，如 sh600519
 * @returns {string|null} 股票代码，如 600519
 */
function getCode(fullCode) {
  if (!isValidStockCode(fullCode)) {
    return null;
  }
  return fullCode.substring(2);
}

module.exports = {
  normalizeStockCode,
  isValidStockCode,
  getMarket,
  getCode,
};
