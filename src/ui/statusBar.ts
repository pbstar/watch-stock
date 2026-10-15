// 状态栏渲染
import * as vscode from "vscode";
import { config } from "../config";
import { getDisplayName, isLockState } from "../utils/stock";
import { formatAmount } from "../shared/format";
import type { Stock } from "../types";

// 涨跌符号
function getPriceSymbol(changeValue: string): string {
  const v = parseFloat(changeValue);
  if (isNaN(v) || v === 0) return "";
  return v > 0 ? "↗" : "↘";
}

// 本次渲染用到的展示配置，一次读齐
interface DisplayOptions {
  maxDisplayCount: number;
  showMiniName: boolean;
  miniNames: Record<string, string>;
  showChangeValue: boolean;
  showLockCount: boolean;
}

function readDisplayOptions(): DisplayOptions {
  return {
    maxDisplayCount: config.getMaxDisplayCount(),
    showMiniName: config.getShowMiniName(),
    miniNames: config.getStockMiniNames(),
    showChangeValue: config.getShowChangeValue(),
    showLockCount: config.getShowLockCount(),
  };
}

// 状态栏封单后缀：开了 showLockCount 且确实有封单才显示
function barLock(stock: Stock, showLockCount: boolean): string {
  if (!showLockCount || !isLockState(stock.priceType)) return "";
  const amount = stock.lockAmount ?? 0;
  return amount > 0 ? ` 封${formatAmount(amount)}` : "";
}

// tooltip 封单后缀：涨跌停一律列出封单金额，不受状态栏配置影响
function tooltipLock(stock: Stock): string {
  if (!isLockState(stock.priceType)) return "";
  const type = stock.priceType === "up" ? "涨停" : "跌停";
  return ` ${type}封单: ${formatAmount(stock.lockAmount ?? 0)}`;
}

// 状态栏一行
function barText(stock: Stock, o: DisplayOptions): string {
  const symbol = getPriceSymbol(stock.changeValue);
  const name = getDisplayName(stock.code, stock.name, o.showMiniName, o.miniNames);
  const change = o.showChangeValue ? `(${stock.changeValue})` : "";
  return `${name} ${stock.current} ${symbol}${stock.changePercent}%${change}${barLock(stock, o.showLockCount)}`;
}

// tooltip 一行：列出该股票的全部行情，含封单
function tooltipLine(stock: Stock): string {
  const symbol = getPriceSymbol(stock.changeValue);
  const detail = `${stock.current} ${symbol}${stock.changePercent}%(${stock.changeValue})`;
  return `${stock.name}(${stock.code}): ${detail}${tooltipLock(stock)}`;
}

export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem | null = null;
  private hidden = false;
  private lastText: string | null = null;
  private lastTooltip: string | null = null;

  // 初始化状态栏
  initialize(): void {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      0,
    );
    this.statusBarItem.command = "watch-stock.manageStock";
    this.statusBarItem.show();
  }

  // 赋值状态栏文本（内容未变化时跳过，避免每 5 秒无谓的 UI 更新）
  private updateText(text: string): void {
    if (text === this.lastText) return;
    this.lastText = text;
    this.statusBarItem!.text = text;
  }

  // 赋值状态栏 tooltip（内容未变化时跳过）
  private updateTooltip(tooltip: string): void {
    if (tooltip === this.lastTooltip) return;
    this.lastTooltip = tooltip;
    this.statusBarItem!.tooltip = tooltip;
  }

  // 渲染股票信息
  render(stocks: string[], stockInfos: Stock[]): void {
    if (!this.statusBarItem) return;
    this.hidden = false;

    if (!stocks || stocks.length === 0) {
      this.updateText("$(add) 点击添加股票");
      this.updateTooltip("点击管理股票，开始您的看盘之旅");
      return;
    }

    if (!stockInfos || stockInfos.length === 0) {
      this.updateText("$(error) 股票获取失败");
      this.updateTooltip("请检查网络连接或股票代码是否正确");
      return;
    }

    const options = readDisplayOptions();
    const text = stockInfos
      .slice(0, options.maxDisplayCount)
      .map((s) => barText(s, options))
      .join(" | ");
    const hiddenCount = stockInfos.length - options.maxDisplayCount;
    this.updateText(hiddenCount > 0 ? `${text} ...(${hiddenCount}+)` : text);

    // 未取到行情的股票只在 tooltip 里提示数量，不占状态栏空间
    const failed =
      stocks.length > stockInfos.length
        ? `\n\n$(warning) ${stocks.length - stockInfos.length}只股票获取失败`
        : "";
    this.updateTooltip(stockInfos.map(tooltipLine).join("\n") + failed);
  }

  // 显示隐藏图标（已隐藏时跳过）
  setHidden(): void {
    if (this.hidden || !this.statusBarItem) return;
    this.hidden = true;
    this.lastText = "$(eye-closed)";
    this.lastTooltip = "状态栏股票信息已隐藏\n点击后选择'恢复显示'";
    this.statusBarItem.text = "$(eye-closed)";
    this.statusBarItem.tooltip = "状态栏股票信息已隐藏\n点击后选择'恢复显示'";
  }

  dispose(): void {
    this.statusBarItem?.dispose();
  }
}
