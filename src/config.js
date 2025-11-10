/**
 * 配置管理模块
 */

const vscode = require("vscode");

const CONFIG_SECTION = "watch-stock";
const DEFAULT_STOCKS = ["sh000001"]; // 默认值：上证指数

/**
 * 获取配置对象
 */
function getConfig() {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

/**
 * 验证股票代码格式
 * @param {string} code - 股票代码
 * @returns {boolean} 是否为有效格式
 */
function isValidStockCode(code) {
  return code && typeof code === "string" && /^(sh|sz|bj)[0-9]{6}$/i.test(code);
}

/**
 * 获取股票代码列表
 * 如果数据格式有问题，直接重置为默认值
 * @returns {Promise<string[]>} 股票代码数组
 */
async function getStocks() {
  const config = getConfig();
  const stocks = config.get("stocks", DEFAULT_STOCKS);

  // 验证所有代码格式
  const validStocks = stocks.filter((code) => isValidStockCode(code));

  // 如果数据有问题（没有有效代码或格式不对），重置为默认值
  if (validStocks.length === 0 || validStocks.length !== stocks.length) {
    await config.update(
      "stocks",
      DEFAULT_STOCKS,
      vscode.ConfigurationTarget.Global
    );
    return DEFAULT_STOCKS;
  }

  // 统一转换为小写
  return validStocks.map((code) => code.toLowerCase());
}

/**
 * 保存股票代码列表
 * @param {string[]} stocks - 股票代码数组
 */
async function saveStocks(stocks) {
  const config = getConfig();
  // 确保所有代码都是标准格式
  const normalizedStocks = stocks
    .map((code) => code.toLowerCase())
    .filter((code) => /^(sh|sz|bj)[0-9]{6}$/.test(code));
  await config.update(
    "stocks",
    normalizedStocks,
    vscode.ConfigurationTarget.Global
  );
}

/**
 * 获取刷新间隔
 * @returns {number} 刷新间隔（毫秒）
 */
function getRefreshInterval() {
  const config = getConfig();
  return config.get("refreshInterval", 5000);
}

/**
 * 获取最大显示数量
 * @returns {number} 最大显示股票数量
 */
function getMaxDisplayCount() {
  const config = getConfig();
  return config.get("maxDisplayCount", 5);
}

/**
 * 是否显示2位简称
 * @returns {boolean}
 */
function getShowTwoLetterCode() {
  const config = getConfig();
  return config.get("showTwoLetterCode", false);
}

module.exports = {
  getStocks,
  saveStocks,
  getRefreshInterval,
  getMaxDisplayCount,
  getShowTwoLetterCode,
};
