// 股票管理：增/删/清/排序
import * as vscode from "vscode";
import { sendMsg } from "../utils/msg";
import { isValidStockCode } from "../utils/stock";
import { searchStockCode } from "../services/stockSearch";
import { getStockList } from "../services/stockService";
import { config, moveStock } from "../config";

// 添加股票，成功返回 true
export async function addStock(): Promise<boolean> {
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

  if (!input) return false;

  const stockInput = input.trim();
  let stockCode: string | null = stockInput;

  if (!isValidStockCode(stockInput)) {
    stockCode = await searchStockCode(stockInput);
  }

  if (!stockCode) {
    sendMsg(`股票获取失败："${stockInput}"，请稍后重试`, { type: "error" });
    return false;
  }

  const stocks = config.getStocks();
  if (stocks.includes(stockCode.toLowerCase())) {
    sendMsg("该股票已存在", { type: "warning" });
    return false;
  }

  const stockInfo = await getStockList([stockCode]);
  if (!stockInfo[0]?.name) {
    sendMsg("股票获取失败，请检查股票代码或名称", { type: "error" });
    return false;
  }

  stocks.push(stockCode.toLowerCase());
  await config.saveStocks(stocks);
  sendMsg(`已添加: ${stockInfo[0].name}(${stockInfo[0].code})`);

  return true;
}

// 移除股票，成功返回被删除的 code，否则 null
export async function removeStock(): Promise<string | null> {
  const stocks = config.getStocks();
  if (stocks.length === 0) {
    sendMsg("当前没有添加任何股票", { type: "warning" });
    return null;
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
  if (!selected) return null;

  const newStocks = stocks.filter((s) => s !== selected.code);
  await config.saveStocks(newStocks);

  sendMsg(`已移除: ${selected.label}`);
  return selected.code;
}

// 清空所有股票，成功返回 true
export async function clearStocks(): Promise<boolean> {
  const stocks = config.getStocks();
  if (stocks.length === 0) return false;

  const confirm = await vscode.window.showWarningMessage(
    "确定要清空所有股票吗？",
    "确定",
    "取消",
  );
  if (confirm !== "确定") return false;

  await config.saveStocks([]);
  sendMsg("已清空所有股票");
  return true;
}

// 排序股票，成功返回 true
export async function sortStocks(): Promise<boolean> {
  const stocks = config.getStocks();
  if (stocks.length === 0) {
    sendMsg("当前没有添加任何股票", { type: "warning" });
    return false;
  }
  if (stocks.length === 1) {
    sendMsg("只有一只股票，无需排序", { type: "warning" });
    return false;
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
  if (!selectedStock) return false;

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
  if (!targetPosition) return false;

  let toIndex = targetPosition.targetIndex;
  const fromIndex = selectedStock.index;
  if (toIndex > fromIndex) toIndex--;

  const newStocks = moveStock(stocks, fromIndex, toIndex);
  await config.saveStocks(newStocks);

  const stockInfo = stockInfos.find((s) => s.code === selectedStock.code);
  const stockName = stockInfo ? stockInfo.name : selectedStock.code;
  sendMsg(`已调整 "${stockName}" 的显示顺序`);

  return true;
}
