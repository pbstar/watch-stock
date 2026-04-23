/**
 * 价格闹钟管理模块
 * 处理股票价格闹钟的设置、触发、删除等操作
 */

const vscode = require("vscode");
const { sendMsg } = require("../utils/sendMsg");
const { getStockList } = require("../services/stockService");
const { getStocks, getAlarms, saveAlarms } = require("../configs/vscodeConfig");

/** 条件文本映射 */
const CONDITION_TEXT = { above: "高于", below: "低于" };

class AlarmManager {
  /**
   * 管理闹钟（设置和管理合一）
   */
  async manageAlarms() {
    const alarms = getAlarms();
    const stocks = getStocks();
    const options = [];

    if (stocks.length > 0) {
      options.push({
        label: "$(add) 设置新闹钟",
        description: "为股票设置价格提醒闹钟",
        action: "add",
      });
    }

    if (alarms.length > 0) {
      const stockCodes = [...new Set(alarms.map((a) => a.stockCode))];
      const stockInfos = await getStockList(stockCodes);

      if (options.length > 0) {
        options.push({
          label: "",
          description: "────────── 现有闹钟 ──────────",
          kind: vscode.QuickPickItemKind.Separator,
        });
      }

      alarms.forEach((alarm) => {
        const info = stockInfos.find((s) => s.code === alarm.stockCode);
        const price = parseFloat(alarm.targetPrice).toFixed(2);
        options.push({
          label: `${info ? info.name : alarm.stockCode} 价格${CONDITION_TEXT[alarm.condition]} ${price} 时提醒`,
          description: "点击删除",
          action: "delete",
          alarm,
        });
      });

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
      sendMsg("请先添加股票才能设置闹钟", { type: "warning" });
      return;
    }

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: alarms.length > 0 ? "选择操作或点击删除闹钟" : "选择操作",
    });

    if (!selected) return;

    switch (selected.action) {
      case "add":
        await this._addAlarm();
        break;
      case "delete":
        await this._removeAlarm(selected.alarm.id);
        sendMsg("已删除闹钟");
        await this.manageAlarms();
        break;
      case "clearAll":
        await this._confirmClearAll();
        break;
    }
  }

  /**
   * 添加新闹钟
   */
  async _addAlarm() {
    const stocks = getStocks();
    if (stocks.length === 0) {
      sendMsg("请先添加股票", { type: "warning" });
      return;
    }

    const stockInfos = await getStockList(stocks);

    // 选择股票
    const stockOptions = stocks.map((code) => {
      const info = stockInfos.find((s) => s?.code === code);
      return {
        label: info ? `${info.name}(${info.code})` : code,
        description: info ? `当前价格: ${info.current}` : "",
        code,
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

    // 输入目标价格
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
        sendMsg("请输入有效的价格", { type: "error" });
        continue;
      }
      if (selectedCondition.value === "above" && price <= currentPrice) {
        sendMsg("目标价格必须高于当前价格", { type: "error" });
        continue;
      }
      if (selectedCondition.value === "below" && price >= currentPrice) {
        sendMsg("目标价格必须低于当前价格", { type: "error" });
        continue;
      }

      targetPrice = price.toFixed(2);
    }

    // 保存闹钟
    const alarms = getAlarms();
    const alarm = {
      id: `${selectedStock.code}_${Date.now()}`,
      stockCode: selectedStock.code.toLowerCase(),
      targetPrice: parseFloat(targetPrice),
      condition: selectedCondition.value,
      createdAt: new Date().toISOString(),
    };
    alarms.push(alarm);
    await saveAlarms(alarms);

    sendMsg(
      `已设置闹钟: ${selectedStock.label} 价格${CONDITION_TEXT[selectedCondition.value]} ${targetPrice} 时提醒`,
    );
  }

  /**
   * 删除指定闹钟
   * @param {string} alarmId - 闹钟ID
   */
  async _removeAlarm(alarmId) {
    const alarms = getAlarms().filter((a) => a.id !== alarmId);
    await saveAlarms(alarms);
  }

  /**
   * 确认后清空所有闹钟
   */
  async _confirmClearAll() {
    const confirm = await vscode.window.showWarningMessage(
      "确定要删除所有闹钟吗？",
      "确定",
      "取消",
    );
    if (confirm === "确定") {
      await saveAlarms([]);
      sendMsg("已删除所有闹钟");
    }
  }

  /**
   * 检查并触发闹钟
   * @param {Array} stockInfos - 股票信息列表
   */
  async checkAlarms(stockInfos) {
    const alarms = getAlarms();
    if (alarms.length === 0) return;

    const triggeredAlarms = [];
    const remainingAlarms = [];

    for (const alarm of alarms) {
      const stockInfo = stockInfos.find((s) => s.code === alarm.stockCode);

      if (!stockInfo) {
        remainingAlarms.push(alarm);
        continue;
      }

      const currentPrice = parseFloat(stockInfo.current);
      const isTriggered =
        (alarm.condition === "above" && currentPrice >= alarm.targetPrice) ||
        (alarm.condition === "below" && currentPrice <= alarm.targetPrice);

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

    if (remainingAlarms.length !== alarms.length) {
      await saveAlarms(remainingAlarms);
    }

    for (const alarm of triggeredAlarms) {
      sendMsg(
        `⏰ 价格闹钟触发: ${alarm.stockName}(${alarm.stockCode}) 当前价格 ${alarm.currentPrice} 已${CONDITION_TEXT[alarm.condition]} ${alarm.targetPrice}`,
      );
    }
  }

  /**
   * 删除股票相关的所有闹钟
   * @param {string} stockCode - 股票代码
   */
  async removeAlarmsByStock(stockCode) {
    const alarms = getAlarms().filter(
      (a) => a.stockCode !== stockCode.toLowerCase(),
    );
    await saveAlarms(alarms);
  }

  /**
   * 清空所有闹钟（无确认）
   */
  async clearAllAlarms() {
    await saveAlarms([]);
  }
}

module.exports = AlarmManager;
