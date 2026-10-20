// 价格闹钟管理
import * as vscode from "vscode";
import { sendMsg } from "../utils/msg";
import { getStockList } from "../services/marketApi";
import { buildStockOptions } from "./stockManager";
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

// 设置新闹钟的菜单项，有股票时才露出
const ADD_ALARM_OPTION: AlarmAction = {
  label: "$(add) 设置新闹钟",
  description: "为股票设置价格提醒闹钟",
  action: "add",
};

// 分隔行：标题写在 description 上，label 必须为空
function separator(title: string): AlarmAction {
  return {
    label: "",
    description: title ? `────────── ${title} ──────────` : "",
    kind: vscode.QuickPickItemKind.Separator,
  };
}

async function inputTargetPrice(
  condition: AlarmCondition,
  currentPrice: number,
): Promise<number | null> {
  // 取不到价时当前价按 0 记，相对校验会把所有正数判为非法，故跳过
  const hasPrice = currentPrice > 0;
  const prompt = hasPrice
    ? `请输入目标价格 (当前价格: ${currentPrice.toFixed(2)})`
    : "请输入目标价格";
  const example = (
    condition === "above" ? currentPrice + 1 : currentPrice - 1
  ).toFixed(2);

  while (true) {
    const priceInput = await vscode.window.showInputBox({
      prompt,
      placeHolder: hasPrice ? `例如: ${example}` : "",
    });
    if (!priceInput) return null;

    const price = parseFloat(priceInput);
    if (isNaN(price) || price <= 0) {
      sendMsg("请输入有效的价格", { type: "error" });
      continue;
    }
    if (!hasPrice) return price;
    // 高于要求价格已涨过目标价，低于要求价格已跌破目标价
    const reached =
      condition === "above" ? price > currentPrice : price < currentPrice;
    if (reached) return price;
    sendMsg(`目标价格必须${CONDITION_TEXT[condition]}当前价格`, {
      type: "error",
    });
  }
}

// 添加新闹钟
async function addAlarm(): Promise<void> {
  const stocks = config.getStocks();
  if (stocks.length === 0) {
    sendMsg("请先添加股票", { type: "warning" });
    return;
  }

  const stockOptions = await buildStockOptions(stocks, (o) => ({
    ...o,
    description: o.info ? `当前价格: ${o.info.current}` : "",
  }));

  const selectedStock = await vscode.window.showQuickPick(stockOptions, {
    placeHolder: "选择要设置闹钟的股票",
  });
  if (!selectedStock) return;

  const selectedCondition = await vscode.window.showQuickPick(
    CONDITION_OPTIONS,
    { placeHolder: "选择触发条件" },
  );
  if (!selectedCondition) return;

  const currentPrice = selectedStock.info
    ? parseFloat(selectedStock.info.current)
    : 0;
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
  const options: AlarmAction[] =
    config.getStocks().length > 0 ? [ADD_ALARM_OPTION] : [];

  if (alarms.length > 0) {
    options.push(...(await alarmListOptions(alarms, options.length > 0)));
  }
  if (options.length === 0) {
    sendMsg("请先添加股票才能设置闹钟", { type: "warning" });
    return;
  }

  const selected = await vscode.window.showQuickPick(options, {
    placeHolder: alarms.length > 0 ? "选择操作或点击删除闹钟" : "选择操作",
  });
  if (selected) await runAlarmAction(selected);
}

// 现有闹钟：每项点击即删除，首尾用分隔行与上下两组操作隔开
async function alarmListOptions(
  alarms: Alarm[],
  withLeadingSeparator: boolean,
): Promise<AlarmAction[]> {
  const stockCodes = [...new Set(alarms.map((a) => a.stockCode))];
  const stockInfos = (await getStockList(stockCodes)).data;
  const infoMap = new Map(stockInfos.map((s) => [s.code, s]));

  const options: AlarmAction[] = withLeadingSeparator
    ? [separator("现有闹钟")]
    : [];
  for (const alarm of alarms) {
    const info = infoMap.get(alarm.stockCode);
    const price = alarm.targetPrice.toFixed(2);
    options.push({
      label: `${info ? info.name : alarm.stockCode} 价格${CONDITION_TEXT[alarm.condition]} ${price} 时提醒`,
      description: "点击删除",
      action: "delete",
      alarm,
    });
  }

  options.push(separator(""), {
    label: "$(trash) 删除所有闹钟",
    description: "清空所有价格闹钟",
    action: "clearAll",
  });
  return options;
}

// 执行菜单动作；删除后重新进入管理界面，方便连着清掉多个闹钟
async function runAlarmAction(selected: AlarmAction): Promise<void> {
  switch (selected.action) {
    case "add":
      await addAlarm();
      break;
    case "delete":
      if (!selected.alarm) break;
      await removeAlarm(selected.alarm.id);
      sendMsg("已删除闹钟");
      await manageAlarms();
      break;
    case "clearAll": {
      const confirm = await vscode.window.showWarningMessage(
        "确定要删除所有闹钟吗？",
        "确定",
        "取消",
      );
      if (confirm !== "确定") break;
      await config.saveAlarms([]);
      sendMsg("已删除所有闹钟");
      break;
    }
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
