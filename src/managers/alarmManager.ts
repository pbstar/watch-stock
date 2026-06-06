// 价格闹钟管理
import * as vscode from "vscode";
import { sendMsg } from "../utils/msg";
import { getStockList } from "../services/stockService";
import { config } from "../config";
import type { Alarm, AlarmCondition, Stock } from "../types";

const CONDITION_TEXT: Record<AlarmCondition, string> = {
  above: "高于",
  below: "低于",
};

const CONDITION_OPTIONS = [
  {
    label: "$(arrow-up) 价格高于",
    value: "above" as AlarmCondition,
    description: "当股票价格上涨到指定价格时触发",
  },
  {
    label: "$(arrow-down) 价格低于",
    value: "below" as AlarmCondition,
    description: "当股票价格下跌到指定价格时触发",
  },
];

interface AlarmAction {
  label: string;
  description?: string;
  action?: "add" | "delete" | "clearAll";
  alarm?: Alarm;
  kind?: vscode.QuickPickItemKind;
}

async function inputTargetPrice(
  condition: AlarmCondition,
  currentPrice: number,
): Promise<number | null> {
  while (true) {
    const priceInput = await vscode.window.showInputBox({
      prompt: `请输入目标价格 (当前价格: ${currentPrice.toFixed(2)})`,
      placeHolder: `例如: ${condition === "above" ? (currentPrice + 1).toFixed(2) : (currentPrice - 1).toFixed(2)}`,
    });
    if (!priceInput) return null;
    const price = parseFloat(priceInput);
    if (isNaN(price) || price <= 0) {
      sendMsg("请输入有效的价格", { type: "error" });
      continue;
    }
    if (condition === "above" && price <= currentPrice) {
      sendMsg("目标价格必须高于当前价格", { type: "error" });
      continue;
    }
    if (condition === "below" && price >= currentPrice) {
      sendMsg("目标价格必须低于当前价格", { type: "error" });
      continue;
    }
    return price;
  }
}

// 添加新闹钟
async function addAlarm(): Promise<void> {
  const stocks = config.getStocks();
  if (stocks.length === 0) {
    sendMsg("请先添加股票", { type: "warning" });
    return;
  }

  const stockInfos = await getStockList(stocks);

  const stockOptions = stocks.map((code) => {
    const info = stockInfos.find((s) => s.code === code);
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

  const selectedCondition = await vscode.window.showQuickPick(
    CONDITION_OPTIONS,
    { placeHolder: "选择触发条件" },
  );
  if (!selectedCondition) return;

  const stockInfo = stockInfos.find((s) => s.code === selectedStock.code);
  const currentPrice = stockInfo ? parseFloat(stockInfo.current) : 0;
  const targetPrice = await inputTargetPrice(
    selectedCondition.value,
    currentPrice,
  );
  if (targetPrice === null) return;

  const alarms = config.getAlarms();
  const alarm: Alarm = {
    id: `${selectedStock.code}_${Date.now()}`,
    stockCode: selectedStock.code.toLowerCase(),
    targetPrice,
    condition: selectedCondition.value,
  };
  alarms.push(alarm);
  await config.saveAlarms(alarms);

  sendMsg(
    `已设置闹钟: ${selectedStock.label} 价格${CONDITION_TEXT[selectedCondition.value]} ${targetPrice.toFixed(2)} 时提醒`,
  );
}

// 删除指定闹钟
async function removeAlarm(alarmId: string): Promise<void> {
  const alarms = config.getAlarms().filter((a) => a.id !== alarmId);
  await config.saveAlarms(alarms);
}

// 主入口：管理闹钟
export async function manageAlarms(): Promise<void> {
  const alarms = config.getAlarms();
  const stocks = config.getStocks();
  const options: AlarmAction[] = [];

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

    for (const alarm of alarms) {
      const info = stockInfos.find((s) => s.code === alarm.stockCode);
      const price = alarm.targetPrice.toFixed(2);
      options.push({
        label: `${info ? info.name : alarm.stockCode} 价格${CONDITION_TEXT[alarm.condition]} ${price} 时提醒`,
        description: "点击删除",
        action: "delete",
        alarm,
      });
    }

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
      await addAlarm();
      break;
    case "delete":
      if (selected.alarm) {
        await removeAlarm(selected.alarm.id);
        sendMsg("已删除闹钟");
        await manageAlarms();
      }
      break;
    case "clearAll":
      if (
        (await vscode.window.showWarningMessage(
          "确定要删除所有闹钟吗？",
          "确定",
          "取消",
        )) === "确定"
      ) {
        await config.saveAlarms([]);
        sendMsg("已删除所有闹钟");
      }
      break;
  }
}

// 检查并触发闹钟
export async function checkAlarms(stockInfos: Stock[]): Promise<void> {
  const alarms = config.getAlarms();
  if (alarms.length === 0) return;

  // 用 Map 建立 code → Stock 索引，将 O(n×m) 降为 O(n+m)
  const infoMap = new Map(stockInfos.map((s) => [s.code, s]));

  const remaining: Alarm[] = [];
  const triggered: { alarm: Alarm; name: string; price: number }[] = [];

  for (const alarm of alarms) {
    const info = infoMap.get(alarm.stockCode);
    if (!info) {
      remaining.push(alarm);
      continue;
    }

    const price = parseFloat(info.current);
    const hit =
      (alarm.condition === "above" && price >= alarm.targetPrice) ||
      (alarm.condition === "below" && price <= alarm.targetPrice);

    if (hit) {
      triggered.push({ alarm, name: info.name, price });
    } else {
      remaining.push(alarm);
    }
  }

  if (remaining.length !== alarms.length) {
    await config.saveAlarms(remaining);
  }

  for (const { alarm, name, price } of triggered) {
    sendMsg(
      `⏰ 价格闹钟触发: ${name}(${alarm.stockCode}) 当前价格 ${price} 已${CONDITION_TEXT[alarm.condition]} ${alarm.targetPrice}`,
    );
  }
}

// 删除某只股票相关的所有闹钟
export async function removeAlarmsByStock(stockCode: string): Promise<void> {
  const alarms = config
    .getAlarms()
    .filter((a) => a.stockCode !== stockCode.toLowerCase());
  await config.saveAlarms(alarms);
}

// 清空所有闹钟（无确认）
export async function clearAllAlarms(): Promise<void> {
  await config.saveAlarms([]);
}
