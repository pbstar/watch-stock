/**
 * 配置管理模块
 */

const vscode = require("vscode");
const { isValidStockCode } = require("./utils/stockCode");

const CONFIG_SECTION = "watch-stock";

/**
 * 获取配置对象
 */
function getConfig() {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

/**
 * 获取并验证代码列表的通用函数
 * @param {string} configKey - 配置项键名
 * @param {string[]} defaultValue - 默认值
 * @returns {string[]} 验证后的代码数组
 */
function getValidatedCodes(configKey) {
  const config = getConfig();
  const codes = config.get(configKey, []);

  // 验证所有代码格式
  const validCodes = codes.filter((code) => isValidStockCode(code));

  // 如果有无效代码,更新配置
  if (validCodes.length !== codes.length) {
    config.update(configKey, validCodes, vscode.ConfigurationTarget.Global);
  }

  return validCodes;
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

/**
 * 获取指数代码列表
 * @returns {string[]} 指数代码数组
 */
function getIndices() {
  return getValidatedCodes("indices");
}

/**
 * 获取板块代码列表
 * @returns {string[]} 板块代码数组
 */
function getSectors() {
  return getValidatedCodes("sectors");
}

/**
 * 获取股票代码列表
 * @returns {string[]} 股票代码数组
 */
function getStocks() {
  return getValidatedCodes("stocks");
}

/**
 * 保存股票代码列表
 * @param {string[]} stocks - 股票代码数组
 */
async function saveStocks(stocks) {
  const config = getConfig();
  await config.update("stocks", stocks, vscode.ConfigurationTarget.Global);
}

module.exports = {
  getStocks,
  saveStocks,
  getMaxDisplayCount,
  getShowTwoLetterCode,
  getIndices,
  getSectors,
};
