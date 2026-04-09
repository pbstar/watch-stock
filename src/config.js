/**
 * 配置管理模块
 */

const vscode = require("vscode");
const { isValidStockCode } = require("./utils/stockCode");

const CONFIG_SECTION = "watch-stock";

/** 配置项定义：key -> 默认值 */
const CONFIG_DEFAULTS = {
  stocks: [],
  maxDisplayCount: 5,
  showMiniName: false,
  stockMiniNames: {},
  showChangeValue: false,
  autoHideByMarket: false,
  priceAlarms: [],
};

/**
 * 获取配置对象
 */
function getConfig() {
  return vscode.workspace.getConfiguration(CONFIG_SECTION);
}

/**
 * 通用配置读取
 * @param {string} key - 配置项键名
 * @returns {*} 配置值
 */
function getConfigValue(key) {
  return getConfig().get(key, CONFIG_DEFAULTS[key]);
}

/**
 * 获取并验证股票代码列表
 * @returns {string[]} 验证后的代码数组
 */
function getStocks() {
  const config = getConfig();
  const codes = config.get("stocks", []);

  const validCodes = codes.filter((code) => isValidStockCode(code));

  if (validCodes.length !== codes.length) {
    config.update("stocks", validCodes, vscode.ConfigurationTarget.Global);
  }

  return validCodes;
}

/**
 * 保存股票代码列表
 * @param {string[]} stocks - 股票代码数组
 */
async function saveStocks(stocks) {
  const config = getConfig();
  await config.update("stocks", stocks, vscode.ConfigurationTarget.Global);
}

/**
 * 移动股票位置
 * @param {string[]} stocks - 当前股票代码数组
 * @param {number} fromIndex - 原位置
 * @param {number} toIndex - 目标位置
 * @returns {string[]} 重新排序后的数组
 */
function moveStock(stocks, fromIndex, toIndex) {
  const result = [...stocks];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

/**
 * 保存闹钟列表
 * @param {Array} alarms - 闹钟列表
 */
async function saveAlarms(alarms) {
  const config = getConfig();
  await config.update("priceAlarms", alarms, vscode.ConfigurationTarget.Global);
}

module.exports = {
  getStocks,
  saveStocks,
  getMaxDisplayCount: () => getConfigValue("maxDisplayCount"),
  getShowMiniName: () => getConfigValue("showMiniName"),
  getStockMiniNames: () => getConfigValue("stockMiniNames"),
  getShowChangeValue: () => getConfigValue("showChangeValue"),
  getAutoHideByMarket: () => getConfigValue("autoHideByMarket"),
  moveStock,
  getAlarms: () => getConfigValue("priceAlarms"),
  saveAlarms,
};
