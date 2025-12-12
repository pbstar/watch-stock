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

module.exports = {
  isValidStockCode,
};
