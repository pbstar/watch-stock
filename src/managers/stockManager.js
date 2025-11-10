/**
 * 股票管理模块
 * 处理股票的添加、删除、清空等操作
 */

const vscode = require("vscode");
const { normalizeStockCode } = require("../utils/stockCode");
const { searchStockCode } = require("../services/stockSearch");
const { getStockInfo, getStocksInfo } = require("../services/stockService");
const { getStocks, saveStocks } = require("../config");

class StockManager {
  /**
   * 添加股票
   * @param {Function} onUpdate - 更新回调函数
   */
  async addStock(onUpdate) {
    const input = await vscode.window.showInputBox({
      prompt: "请输入股票代码或名称",
      placeHolder: "例如: sh600519 或 sz000001 或 贵州茅台",
    });

    if (!input || !input.trim()) {
      return;
    }

    const stockInput = input.trim();
    let stockCode = null;

    // 先尝试标准化代码
    stockCode = normalizeStockCode(stockInput);

    // 如果不是标准代码格式，则尝试搜索
    if (!stockCode) {
      stockCode = await searchStockCode(stockInput);
    }

    if (!stockCode) {
      vscode.window.showErrorMessage(
        `股票获取失败："${stockInput}"\n\n` +
          "可能的原因：\n" +
          "• 股票名称或代码输入错误\n" +
          "• 该股票不存在或已退市\n" +
          "• 网络连接问题\n\n" +
          "请尝试：\n" +
          "• 使用股票代码（如：sh601318）\n" +
          "• 检查股票名称拼写\n" +
          "• 稍后重试"
      );
      return;
    }

    // 验证股票是否存在
    const stockInfo = await getStockInfo(stockCode);
    if (!stockInfo || !stockInfo.name) {
      vscode.window.showErrorMessage("股票获取失败，请检查股票代码或名称");
      return;
    }

    // 检查是否已存在
    const stocks = await getStocks();
    if (stocks.includes(stockCode.toLowerCase())) {
      vscode.window.showWarningMessage("该股票已存在");
      return;
    }

    // 添加股票
    stocks.push(stockCode.toLowerCase());
    await saveStocks(stocks);
    vscode.window.showInformationMessage(
      `已添加: ${stockInfo.name}(${stockInfo.code})`
    );

    // 触发更新
    if (onUpdate) {
      onUpdate();
    }
  }

  /**
   * 移除股票
   * @param {Function} onUpdate - 更新回调函数
   */
  async removeStock(onUpdate) {
    const stocks = await getStocks();
    if (stocks.length === 0) {
      vscode.window.showInformationMessage("当前没有添加任何股票");
      return;
    }

    // 获取股票名称用于显示
    const stockInfos = await getStocksInfo(stocks);

    // 创建代码到信息的映射
    const infoMap = new Map();
    stockInfos.forEach((info) => {
      if (info && info.fullCode) {
        infoMap.set(info.fullCode.toLowerCase(), info);
      }
    });

    const stockOptions = stocks.map((code) => {
      const info = infoMap.get(code.toLowerCase());
      return {
        label: info ? `${info.name}(${info.code})` : code,
        description: "点击移除",
        code: code,
      };
    });

    const selected = await vscode.window.showQuickPick(stockOptions, {
      placeHolder: "选择要移除的股票",
    });

    if (selected) {
      const newStocks = stocks.filter((s) => s !== selected.code);
      await saveStocks(newStocks);
      vscode.window.showInformationMessage(`已移除: ${selected.label}`);

      // 触发更新
      if (onUpdate) {
        onUpdate();
      }
    }
  }

  /**
   * 清空所有股票
   * @param {Function} onUpdate - 更新回调函数
   */
  async clearStocks(onUpdate) {
    const stocks = await getStocks();
    if (stocks.length === 0) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      "确定要清空所有股票吗？",
      "确定",
      "取消"
    );

    if (confirm === "确定") {
      await saveStocks([]);
      vscode.window.showInformationMessage("已清空所有股票");

      // 触发更新
      if (onUpdate) {
        onUpdate();
      }
    }
  }

  /**
   * 查看所有股票
   */
  async viewStocks() {
    const stocks = await getStocks();
    if (stocks.length === 0) {
      vscode.window.showInformationMessage("当前没有添加任何股票");
      return;
    }

    const stockInfos = await getStocksInfo(stocks);

    const stockDetails = stockInfos.map((info) => {
      return info ? `${info.name}(${info.code})` : "未知";
    });

    vscode.window.showInformationMessage(
      `已添加的股票：${stockDetails.join(", ")}`
    );
  }
}

module.exports = StockManager;
