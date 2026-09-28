// 股票管理：增/删/清/排序
import * as vscode from "vscode";
import { sendMsg } from "../utils/msg";
import { isValidStockCode, isFundCode } from "../utils/stock";
import { searchStockCode } from "../services/stockSearch";
import { getStockList } from "../services/stockService";
import { config } from "../config";
import type { Stock } from "../types";

// 快速选择项：附带原始下标、code 与行情，便于调用点定制文案与定位
export interface StockOption extends vscode.QuickPickItem {
  code: string;
  index: number;
  info?: Stock;
}

// 拉取行情并构造「名称(代码)」选项，管理股票与闹钟入口共用；
// decorate 用于各入口追加序号、说明等自身差异
export async function buildStockOptions(
  codes: string[],
  decorate: (option: StockOption, index: number) => StockOption = (o) => o,
): Promise<StockOption[]> {
  const stockInfos = await getStockList(codes);
  const infoMap = new Map(stockInfos.map((s) => [s.code, s]));
  return codes.map((code, index) => {
    const info = infoMap.get(code);
    return decorate(
      { label: info ? `${info.name}(${info.code})` : code, code, index, info },
      index,
    );
  });
}

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
  let stockCode: string | null = null;

  if (isValidStockCode(stockInput)) {
    stockCode = stockInput;
  } else if (isFundCode(stockInput)) {
    stockCode = stockInput.startsWith("5")
      ? `sh${stockInput}`
      : `sz${stockInput}`;
  } else {
    stockCode = await searchStockCode(stockInput);
  }

  if (!stockCode) {
    sendMsg(`股票获取失败："${stockInput}"，请稍后重试`, { type: "error" });
    return false;
  }

  // 统一转为小写，后续比较和存储均使用标准化代码
  stockCode = stockCode.toLowerCase();

  const stocks = config.getStocks();
  if (stocks.includes(stockCode)) {
    sendMsg("该股票已存在", { type: "warning" });
    return false;
  }

  const stockInfo = await getStockList([stockCode]);
  if (!stockInfo[0]?.name) {
    sendMsg("股票获取失败，请检查股票代码或名称", { type: "error" });
    return false;
  }

  stocks.push(stockCode);
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

  const options = await buildStockOptions(stocks, (o) => ({
    ...o,
    description: "点击移除",
  }));

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

// 手动排序股票（仅在自定义排序模式下可用）
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

  const currentOrder = await buildStockOptions(stocks, (o, index) => ({
    ...o,
    label: `${index + 1}. ${o.label}`,
    description: "点击选择要移动的股票",
  }));

  const selectedStock = await vscode.window.showQuickPick(currentOrder, {
    placeHolder: "选择要移动位置的股票",
  });
  if (!selectedStock) return false;

  // targetIndex 用原始下标，表示「插到该股票所在位置」
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

  const fromIndex = selectedStock.index;
  // 移除后再插入：向后移动时目标索引需前移一位
  let toIndex = targetPosition.targetIndex;
  if (toIndex > fromIndex) toIndex--;
  const newStocks = [...stocks];
  const [moved] = newStocks.splice(fromIndex, 1);
  newStocks.splice(toIndex, 0, moved);
  await config.saveStocks(newStocks);

  sendMsg(`已调整 "${selectedStock.info?.name ?? selectedStock.code}" 的显示顺序`);

  return true;
}
