/**
 * 股票管理模块
 * 处理股票的添加、删除、清空等操作
 */

const vscode = require("vscode");
const { isValidStockCode } = require("../utils/stockCode");
const { searchStockCode } = require("../services/stockSearch");
const { getStockList } = require("../services/stockService");
const { getStocks, saveStocks, moveStock } = require("../config");

class StockManager {
  /**
   * 添加股票
   * @param {Function} onUpdate - 更新回调函数
   */
  async addStock(onUpdate) {
    const input = await vscode.window.showInputBox({
      prompt: "请输入股票代码或名称",
      placeHolder: "例如: sh600519 或 sz000001 或 贵州茅台",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "请输入有效的股票代码或名称";
        }
        if (value.trim().length > 20) {
          return "输入内容过长，请重新输入";
        }
        return null;
      },
    });

    if (!input || !input.trim()) {
      return;
    }

    const stockInput = input.trim();
    let stockCode = stockInput;

    const isCode = isValidStockCode(stockInput);

    // 如果不是标准代码格式，则尝试搜索
    if (!isCode) {
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
          "• 稍后重试",
      );
      return;
    }

    // 检查是否已存在
    const stocks = getStocks();
    if (stocks.includes(stockCode.toLowerCase())) {
      vscode.window.showWarningMessage("该股票已存在");
      return;
    }

    // 验证股票是否存在
    const stockInfo = await getStockList([stockCode]);
    if (!stockInfo || !stockInfo[0].name) {
      vscode.window.showErrorMessage("股票获取失败，请检查股票代码或名称");
      return;
    }

    // 添加股票
    stocks.push(stockCode.toLowerCase());
    await saveStocks(stocks);
    vscode.window.showInformationMessage(
      `已添加: ${stockInfo[0].name}(${stockInfo[0].code})`,
    );

    // 触发更新
    if (onUpdate) {
      onUpdate();
    }
  }

  /**
   * 移除股票
   * @param {Function} onUpdate - 更新回调函数
   * @param {Object} alarmManager - 闹钟管理器
   */
  async removeStock(onUpdate, alarmManager) {
    const stocks = getStocks();
    if (stocks.length === 0) {
      vscode.window.showInformationMessage("当前没有添加任何股票");
      return;
    }

    // 获取股票名称用于显示
    const stockInfos = await getStockList(stocks);

    const stockOptions = stocks.map((code) => {
      const info = stockInfos.find((s) => s && s.code === code);
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

      // 删除相关闹钟
      if (alarmManager) {
        await alarmManager.removeAlarmsByStock(selected.code);
      }

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
   * @param {Object} alarmManager - 闹钟管理器
   */
  async clearStocks(onUpdate, alarmManager) {
    const stocks = getStocks();
    if (stocks.length === 0) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      "确定要清空所有股票吗？",
      "确定",
      "取消",
    );

    if (confirm === "确定") {
      // 删除所有相关闹钟
      if (alarmManager) {
        await alarmManager.clearAllAlarms();
      }

      await saveStocks([]);
      vscode.window.showInformationMessage("已清空所有股票");

      // 触发更新
      if (onUpdate) {
        onUpdate();
      }
    }
  }

  /**
   * 排序股票
   * @param {Function} onUpdate - 更新回调函数
   */
  async sortStocks(onUpdate) {
    const stocks = getStocks();
    if (stocks.length === 0) {
      vscode.window.showInformationMessage("当前没有添加任何股票");
      return;
    }

    if (stocks.length === 1) {
      vscode.window.showInformationMessage("只有一只股票，无需排序");
      return;
    }

    // 获取股票信息用于显示
    const stockInfos = await getStockList(stocks);

    // 创建当前顺序的选项列表
    let currentOrder = stocks.map((code, index) => {
      const info = stockInfos.find((s) => s && s.code === code);
      return {
        label: `${index + 1}. ${info ? `${info.name}(${info.code})` : code}`,
        description: "点击选择要移动的股票",
        code: code,
        index: index,
      };
    });

    // 第一步：选择要移动的股票
    const selectedStock = await vscode.window.showQuickPick(currentOrder, {
      placeHolder: "选择要移动位置的股票",
    });

    if (!selectedStock) {
      return;
    }

    // 第二步：选择目标位置
    const targetOptions = currentOrder
      .filter((item) => item.code !== selectedStock.code)
      .map((item) => ({
        label: `移动到 "${item.label}" 之前`,
        targetIndex: item.index,
      }));

    // 添加"移动到末尾"选项
    targetOptions.push({
      label: "移动到末尾",
      targetIndex: stocks.length,
    });

    const targetPosition = await vscode.window.showQuickPick(targetOptions, {
      placeHolder: `选择 "${selectedStock.label}" 的目标位置`,
    });

    if (!targetPosition) {
      return;
    }

    // 计算实际的目标索引
    let toIndex = targetPosition.targetIndex;
    const fromIndex = selectedStock.index;

    // 如果目标位置在源位置之后，需要调整索引
    if (toIndex > fromIndex) {
      toIndex--;
    }

    // 执行移动
    const newStocks = moveStock(stocks, fromIndex, toIndex);
    await saveStocks(newStocks);

    const stockInfo = stockInfos.find(
      (s) => s && s.code === selectedStock.code,
    );
    const stockName = stockInfo ? stockInfo.name : selectedStock.code;
    vscode.window.showInformationMessage(`已调整 "${stockName}" 的显示顺序`);

    // 触发更新
    if (onUpdate) {
      onUpdate();
    }
  }
}

module.exports = StockManager;
