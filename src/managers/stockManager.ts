// 股票管理：增/删/清/排序
import * as vscode from "vscode";
import { sendMsg } from "../utils/msg";
import { isValidStockCode } from "../utils/stock";
import { searchStockCode } from "../services/stockSearch";
import { getStockList } from "../services/stockService";
import { config, moveStock } from "../config";
import type { AlarmManager } from "./alarmManager";

type UpdateCallback = () => void;

// 添加股票
export async function addStock(onUpdate?: UpdateCallback): Promise<void> {
  const input = await vscode.window.showInputBox({
    prompt: "请输入股票代码或名称",
    placeHolder: "例如: sh600519 或 sz000001 或 贵州茅台",
    validateInput: (value) => {
      if (!value || value.trim().length === 0)
        return "请输入有效的股票代码或名称";
      if (value.trim().length > 20) return "输入内容过长，请重新输入";
      return null;
    },
  });

  if (!input) return;

  const stockInput = input.trim();
  let stockCode: string | null = stockInput;

  if (!isValidStockCode(stockInput)) {
    stockCode = await searchStockCode(stockInput);
  }

  if (!stockCode) {
    sendMsg(`股票获取失败："${stockInput}"，请稍后重试`, { type: "error" });
    return;
  }

  const stocks = config.getStocks();
  if (stocks.includes(stockCode.toLowerCase())) {
    sendMsg("该股票已存在", { type: "warning" });
    return;
  }

  const stockInfo = await getStockList([stockCode]);
  if (!stockInfo[0]?.name) {
    sendMsg("股票获取失败，请检查股票代码或名称", { type: "error" });
    return;
  }

  stocks.push(stockCode.toLowerCase());
  await config.saveStocks(stocks);
  sendMsg(`已添加: ${stockInfo[0].name}(${stockInfo[0].code})`);

  onUpdate?.();
}

// 移除股票
export async function removeStock(
  onUpdate?: UpdateCallback,
  alarmManager?: AlarmManager,
): Promise<void> {
  const stocks = config.getStocks();
  if (stocks.length === 0) {
    sendMsg("当前没有添加任何股票", { type: "warning" });
    return;
  }

  const stockInfos = await getStockList(stocks);
  const options = stocks.map((code) => {
    const info = stockInfos.find((s) => s.code === code);
    return {
      label: info ? `${info.name}(${info.code})` : code,
      description: "点击移除",
      code,
    };
  });

  const selected = await vscode.window.showQuickPick(options, {
    placeHolder: "选择要移除的股票",
  });
  if (!selected) return;

  const newStocks = stocks.filter((s) => s !== selected.code);
  await config.saveStocks(newStocks);

  if (alarmManager) await alarmManager.removeAlarmsByStock(selected.code);

  sendMsg(`已移除: ${selected.label}`);
  onUpdate?.();
}

// 清空所有股票
export async function clearStocks(
  onUpdate?: UpdateCallback,
  alarmManager?: AlarmManager,
): Promise<void> {
  const stocks = config.getStocks();
  if (stocks.length === 0) return;

  const confirm = await vscode.window.showWarningMessage(
    "确定要清空所有股票吗？",
    "确定",
    "取消",
  );
  if (confirm !== "确定") return;

  if (alarmManager) await alarmManager.clearAllAlarms();

  await config.saveStocks([]);
  sendMsg("已清空所有股票");
  onUpdate?.();
}

// 排序股票
export async function sortStocks(onUpdate?: UpdateCallback): Promise<void> {
  const stocks = config.getStocks();
  if (stocks.length === 0) {
    sendMsg("当前没有添加任何股票", { type: "warning" });
    return;
  }
  if (stocks.length === 1) {
    sendMsg("只有一只股票，无需排序", { type: "warning" });
    return;
  }

  const stockInfos = await getStockList(stocks);
  const currentOrder = stocks.map((code, index) => {
    const info = stockInfos.find((s) => s.code === code);
    return {
      label: `${index + 1}. ${info ? `${info.name}(${info.code})` : code}`,
      description: "点击选择要移动的股票",
      code,
      index,
    };
  });

  const selectedStock = await vscode.window.showQuickPick(currentOrder, {
    placeHolder: "选择要移动位置的股票",
  });
  if (!selectedStock) return;

  const targetOptions = currentOrder
    .filter((item) => item.code !== selectedStock.code)
    .map((item) => ({
      label: `移动到 "${item.label}" 之前`,
      targetIndex: item.index,
    }));
  targetOptions.push({ label: "移动到末尾", targetIndex: stocks.length });

  const targetPosition = await vscode.window.showQuickPick(targetOptions, {
    placeHolder: `选择 "${selectedStock.label}" 的目标位置`,
  });
  if (!targetPosition) return;

  let toIndex = targetPosition.targetIndex;
  const fromIndex = selectedStock.index;
  if (toIndex > fromIndex) toIndex--;

  const newStocks = moveStock(stocks, fromIndex, toIndex);
  await config.saveStocks(newStocks);

  const stockInfo = stockInfos.find((s) => s.code === selectedStock.code);
  const stockName = stockInfo ? stockInfo.name : selectedStock.code;
  sendMsg(`已调整 "${stockName}" 的显示顺序`);

  onUpdate?.();
}
