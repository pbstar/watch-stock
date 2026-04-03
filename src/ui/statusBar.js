/**
 * 状态栏管理模块
 */

const vscode = require("vscode");
const {
  getMaxDisplayCount,
  getShowMiniName,
  getStockMiniNames,
  getShowChangeValue,
} = require("../config");

class StatusBarManager {
  constructor() {
    this.statusBarItem = null;
    this._hidden = false;
  }

  /**
   * 初始化状态栏
   */
  initialize() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      0,
    );
    this.statusBarItem.command = "watch-stock.manageStock";
    this.statusBarItem.show();
  }

  /**
   * 渲染股票信息到状态栏
   * @param {string[]} stocks 股票代码列表
   * @param {object[]} stockInfos 股票数据列表
   */
  render(stocks, stockInfos) {
    if (!this.statusBarItem) return;
    this._hidden = false;

    // 无股票时的提示
    if (!stocks || stocks.length === 0) {
      this.statusBarItem.text = "$(add) 点击添加股票";
      this.statusBarItem.tooltip = "点击管理股票，开始您的看盘之旅";
      return;
    }

    // 无有效数据时的处理
    if (!stockInfos || stockInfos.length === 0) {
      this.statusBarItem.text = "$(error) 股票获取失败";
      this.statusBarItem.tooltip = "请检查网络连接或股票代码是否正确";
      return;
    }

    // 状态栏显示前 maxDisplayCount 个股票
    const maxDisplayCount = getMaxDisplayCount();
    const displayStocks = stockInfos.slice(0, maxDisplayCount);
    const showMiniName = getShowMiniName();
    const stockMiniNames = getStockMiniNames();
    const showChangeValue = getShowChangeValue();

    // 构建状态栏文本
    const stockTexts = displayStocks.map((stock) => {
      const symbol = stock.changeValue >= 0 ? "↗" : "↘";
      // 优先取配置简称，无配置时截取前两位
      const displayName = showMiniName
        ? stockMiniNames[stock.code] ||
          (stock.name.length > 2 ? stock.name.substring(0, 2) : stock.name)
        : stock.name;
      return `${displayName} ${stock.current} ${symbol}${stock.changePercent}%${showChangeValue ? `(${stock.changeValue})` : ""}`;
    });

    // 处理超出显示限制的情况
    const text = stockTexts.join(" | ");
    const finalText =
      stockInfos.length > maxDisplayCount
        ? `${text} ...(${stockInfos.length - maxDisplayCount}+)`
        : text;

    this.statusBarItem.text = finalText;

    // 构建悬停提示
    let tooltip = stockInfos
      .map(
        (stock) =>
          `${stock.name}(${stock.code}): ${stock.current} ${
            stock.changeValue >= 0 ? "+" : ""
          }${stock.changePercent}%(${stock.changeValue})`,
      )
      .join("\n");

    // 添加获取失败提示（如果有）
    if (stocks.length > stockInfos.length) {
      const failedCount = stocks.length - stockInfos.length;
      tooltip += `\n\n$(warning) ${failedCount}只股票获取失败`;
    }

    this.statusBarItem.tooltip = tooltip;
  }

  /**
   * 显示隐藏图标（已隐藏时跳过，避免重复更新）
   */
  setHidden() {
    if (this._hidden || !this.statusBarItem) return;
    this._hidden = true;
    this.statusBarItem.text = "$(eye-closed)";
    this.statusBarItem.tooltip = "状态栏股票信息已隐藏\n点击后选择'显示状态栏'";
  }

  /**
   * 获取状态栏项（用于注册命令）
   */
  getStatusBarItem() {
    return this.statusBarItem;
  }

  /**
   * 销毁状态栏
   */
  dispose() {
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
    }
  }
}

module.exports = StatusBarManager;
