// 状态栏渲染
import * as vscode from "vscode";
import { config } from "../config";
import { formatAmount } from "../utils/stock";
import type { PriceType, Stock, StatusBar } from "../types";

// 判断涨跌方向：涨 → 1，跌 → -1，平 → 0
function priceDirection(changeValue: string): number {
  const v = parseFloat(changeValue);
  if (isNaN(v)) return 0;
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

// 涨跌符号
function getPriceSymbol(changeValue: string): string {
  const d = priceDirection(changeValue);
  if (d > 0) return "↗";
  if (d < 0) return "↘";
  return "";
}

// 判断是否处于涨跌停状态
function isLockState(priceType?: PriceType): boolean {
  return priceType === "up" || priceType === "down";
}

export class StatusBarManager implements StatusBar {
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

    const maxDisplayCount = config.getMaxDisplayCount();
    const showMiniName = config.getShowMiniName();
    const stockMiniNames = config.getStockMiniNames();
    const showChangeValue = config.getShowChangeValue();
    const showLockCount = config.getShowLockCount();

    const stockTexts: string[] = [];
    const tooltipLines: string[] = [];

    stockInfos.forEach((stock, i) => {
      const symbol = getPriceSymbol(stock.changeValue);
      // tooltip 行（所有股票）
      const lockType = isLockState(stock.priceType)
        ? ` ${stock.priceType === "up" ? "涨停" : "跌停"}封单: ${formatAmount(stock.lockAmount ?? 0)}`
        : "";
      tooltipLines.push(
        `${stock.name}(${stock.code}): ${stock.current} ${symbol}${stock.changePercent}%(${stock.changeValue})${lockType}`,
      );
      // 状态栏文本（仅前 maxDisplayCount 只）
      if (i >= maxDisplayCount) return;
      const displayName = showMiniName
        ? stockMiniNames[stock.code] ||
          (stock.name.length > 2 ? stock.name.substring(0, 2) : stock.name)
        : stock.name;
      const lockText =
        showLockCount &&
        (stock.lockAmount ?? 0) > 0 &&
        isLockState(stock.priceType)
          ? ` 封${formatAmount(stock.lockAmount ?? 0)}`
          : "";
      stockTexts.push(
        `${displayName} ${stock.current} ${symbol}${stock.changePercent}%${showChangeValue ? `(${stock.changeValue})` : ""}${lockText}`,
      );
    });

    const statusText = stockTexts.join(" | ");
    this.updateText(
      stockInfos.length > maxDisplayCount
        ? `${statusText} ...(${stockInfos.length - maxDisplayCount}+)`
        : statusText,
    );

    const failedInfo =
      stocks.length > stockInfos.length
        ? `\n\n$(warning) ${stocks.length - stockInfos.length}只股票获取失败`
        : "";
    this.updateTooltip(tooltipLines.join("\n") + failedInfo);
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

  getStatusBarItem(): vscode.StatusBarItem | null {
    return this.statusBarItem;
  }

  dispose(): void {
    this.statusBarItem?.dispose();
  }
}
