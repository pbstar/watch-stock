/**
 * 价格闹钟管理模块
 * 处理股票价格闹钟的设置、触发、删除等操作
 */

const vscode = require("vscode");
const { getStockList } = require("../services/stockService");

const CONFIG_SECTION = "watch-stock";
const ALARMS_KEY = "priceAlarms";

/**
 * 获取所有闹钟
 * @returns {Array} 闹钟列表
 */
function getAlarms() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get(ALARMS_KEY, []);
}

/**
 * 保存闹钟列表
 * @param {Array} alarms - 闹钟列表
 */
async function saveAlarms(alarms) {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  await config.update(ALARMS_KEY, alarms, vscode.ConfigurationTarget.Global);
}

/**
 * 添加闹钟
 * @param {string} stockCode - 股票代码
 * @param {number} targetPrice - 目标价格
 * @param {string} condition - 条件类型: 'above'(大于) 或 'below'(小于)
 */
async function addAlarm(stockCode, targetPrice, condition) {
  const alarms = getAlarms();
  const alarm = {
    id: `${stockCode}_${Date.now()}`,
    stockCode: stockCode.toLowerCase(),
    targetPrice,
    condition, // 'above' 或 'below'
    createdAt: new Date().toISOString(),
  };
  alarms.push(alarm);
  await saveAlarms(alarms);
  return alarm;
}

/**
 * 删除指定闹钟
 * @param {string} alarmId - 闹钟ID
 */
async function removeAlarm(alarmId) {
  const alarms = getAlarms();
  const newAlarms = alarms.filter((a) => a.id !== alarmId);
  await saveAlarms(newAlarms);
}

/**
 * 删除股票相关的所有闹钟
 * @param {string} stockCode - 股票代码
 */
async function removeAlarmsByStock(stockCode) {
  const alarms = getAlarms();
  const newAlarms = alarms.filter(
    (a) => a.stockCode !== stockCode.toLowerCase(),
  );
  await saveAlarms(newAlarms);
}

/**
 * 清空所有闹钟
 */
async function clearAllAlarms() {
  await saveAlarms([]);
}

/**
 * 检查并触发闹钟
 * @param {Array} stockInfos - 股票信息列表
 */
async function checkAlarms(stockInfos) {
  const alarms = getAlarms();
  if (alarms.length === 0) return;

  const triggeredAlarms = [];
  const remainingAlarms = [];

  for (const alarm of alarms) {
    const stockInfo = stockInfos.find(
      (s) => s.code === alarm.stockCode.toLowerCase(),
    );

    if (!stockInfo) {
      remainingAlarms.push(alarm);
      continue;
    }

    const currentPrice = parseFloat(stockInfo.current);
    let isTriggered = false;

    if (alarm.condition === "above" && currentPrice >= alarm.targetPrice) {
      isTriggered = true;
    } else if (
      alarm.condition === "below" &&
      currentPrice <= alarm.targetPrice
    ) {
      isTriggered = true;
    }

    if (isTriggered) {
      triggeredAlarms.push({
        ...alarm,
        stockName: stockInfo.name,
        currentPrice,
      });
    } else {
      remainingAlarms.push(alarm);
    }
  }

  // 保存未触发的闹钟
  if (remainingAlarms.length !== alarms.length) {
    await saveAlarms(remainingAlarms);
  }

  // 显示触发提醒
  for (const alarm of triggeredAlarms) {
    const conditionText = alarm.condition === "above" ? "高于" : "低于";
    vscode.window.showInformationMessage(
      `⏰ 价格闹钟触发: ${alarm.stockName}(${alarm.stockCode}) 当前价格 ${alarm.currentPrice} 已${conditionText} ${alarm.targetPrice}`,
      "知道了",
    );
  }
}

class AlarmManager {
  /**
   * 管理闹钟（设置和管理合一）
   */
  async manageAlarms() {
    const alarms = getAlarms();
    const { getStocks } = require("../config");
    const stocks = getStocks();

    const options = [];

    // 如果有股票，显示设置新闹钟选项
    if (stocks.length > 0) {
      options.push({
        label: "$(add) 设置新闹钟",
        description: "为股票设置价格提醒闹钟",
        action: "add",
      });
    }

    // 如果有闹钟，显示现有闹钟列表
    if (alarms.length > 0) {
      // 获取股票信息用于显示
      const stockCodes = [...new Set(alarms.map((a) => a.stockCode))];
      const stockInfos = await getStockList(stockCodes);

      // 添加分隔线
      if (options.length > 0) {
        options.push({
          label: "",
          description: "────────── 现有闹钟 ──────────",
          kind: vscode.QuickPickItemKind.Separator,
        });
      }

      // 添加现有闹钟
      alarms.forEach((alarm) => {
        const info = stockInfos.find((s) => s.code === alarm.stockCode);
        const conditionText = alarm.condition === "above" ? "高于" : "低于";
        const price = parseFloat(alarm.targetPrice).toFixed(2);
        options.push({
          label: `${info ? info.name : alarm.stockCode} 价格${conditionText} ${price} 时提醒`,
          description: "点击删除",
          action: "delete",
          alarm: alarm,
        });
      });

      // 添加删除全部选项
      options.push({
        label: "",
        description: "",
        kind: vscode.QuickPickItemKind.Separator,
      });
      options.push({
        label: "$(trash) 删除所有闹钟",
        description: "清空所有价格闹钟",
        action: "clearAll",
      });
    }

    if (options.length === 0) {
      vscode.window.showInformationMessage("请先添加股票才能设置闹钟");
      return;
    }

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: alarms.length > 0 ? "选择操作或点击删除闹钟" : "选择操作",
    });

    if (!selected) return;

    switch (selected.action) {
      case "add":
        await this.addNewAlarm();
        break;
      case "delete":
        await this.deleteAlarm(selected.alarm);
        break;
      case "clearAll":
        await this.deleteAllAlarms();
        break;
    }
  }

  /**
   * 添加新闹钟
   */
  async addNewAlarm() {
    const { getStocks } = require("../config");
    const stocks = getStocks();

    if (stocks.length === 0) {
      vscode.window.showInformationMessage("请先添加股票");
      return;
    }

    // 获取股票信息用于显示
    const stockInfos = await getStockList(stocks);

    // 选择股票
    const stockOptions = stocks.map((code) => {
      const info = stockInfos.find((s) => s && s.code === code);
      return {
        label: info ? `${info.name}(${info.code})` : code,
        description: info ? `当前价格: ${info.current}` : "",
        code: code,
      };
    });

    const selectedStock = await vscode.window.showQuickPick(stockOptions, {
      placeHolder: "选择要设置闹钟的股票",
    });

    if (!selectedStock) return;

    // 选择条件类型
    const conditionOptions = [
      {
        label: "$(arrow-up) 价格高于",
        value: "above",
        description: "当股票价格上涨到指定价格时触发",
      },
      {
        label: "$(arrow-down) 价格低于",
        value: "below",
        description: "当股票价格下跌到指定价格时触发",
      },
    ];

    const selectedCondition = await vscode.window.showQuickPick(
      conditionOptions,
      {
        placeHolder: "选择触发条件",
      },
    );

    if (!selectedCondition) return;

    // 输入目标价格（循环直到输入正确或取消）
    const stockInfo = stockInfos.find((s) => s.code === selectedStock.code);
    const currentPrice = stockInfo ? parseFloat(stockInfo.current) : 0;

    let targetPrice = null;
    while (targetPrice === null) {
      const priceInput = await vscode.window.showInputBox({
        prompt: `请输入目标价格 (当前价格: ${currentPrice.toFixed(2)})`,
        placeHolder: `例如: ${selectedCondition.value === "above" ? (currentPrice + 1).toFixed(2) : (currentPrice - 1).toFixed(2)}`,
      });

      if (!priceInput) return;

      const price = parseFloat(priceInput);
      if (isNaN(price) || price <= 0) {
        vscode.window.showErrorMessage("请输入有效的价格");
        continue;
      }
      if (selectedCondition.value === "above" && price <= currentPrice) {
        vscode.window.showErrorMessage("目标价格必须高于当前价格");
        continue;
      }
      if (selectedCondition.value === "below" && price >= currentPrice) {
        vscode.window.showErrorMessage("目标价格必须低于当前价格");
        continue;
      }

      targetPrice = price.toFixed(2);
    }

    // 添加闹钟
    await addAlarm(
      selectedStock.code,
      parseFloat(targetPrice),
      selectedCondition.value,
    );

    const conditionText = selectedCondition.value === "above" ? "高于" : "低于";
    vscode.window.showInformationMessage(
      `已设置闹钟: ${selectedStock.label} 价格${conditionText} ${targetPrice} 时提醒`,
    );
  }

  /**
   * 删除单个闹钟
   */
  async deleteAlarm(alarm) {
    await removeAlarm(alarm.id);
    vscode.window.showInformationMessage("已删除闹钟");
    // 重新打开管理界面
    await this.manageAlarms();
  }

  /**
   * 清空所有闹钟
   */
  async deleteAllAlarms() {
    const confirm = await vscode.window.showWarningMessage(
      "确定要删除所有闹钟吗？",
      "确定",
      "取消",
    );

    if (confirm === "确定") {
      await clearAllAlarms();
      vscode.window.showInformationMessage("已删除所有闹钟");
    }
  }
}

module.exports = {
  AlarmManager,
  removeAlarmsByStock,
  clearAllAlarms,
  checkAlarms,
};
