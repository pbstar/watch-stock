// 状态栏渲染
import * as vscode from "vscode";
import { config } from "../config";
import { formatAmount } from "../utils/stock";
import type { Stock } from "../types";

// 判断涨跌方向：涨/平返回 true
function isPriceUp(changeValue: string): boolean {
  return parseFloat(changeValue) >= 0;
}

// 判断是否处于涨跌停状态
function isLockState(priceType?: string): priceType is "up" | "down" {
  return priceType === "up" || priceType === "down";
}

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem | null = null;
  private hidden = false;

  // 初始化状态栏
  initialize(): void {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      0,
    );
    this.statusBarItem.command = "watch-stock.manageStock";
    this.statusBarItem.show();
  }

  // 渲染股票信息
  render(stocks: string[], stockInfos: Stock[]): void {
    if (!this.statusBarItem) return;
    this.hidden = false;

    if (!stocks || stocks.length === 0) {
      this.statusBarItem.text = "$(add) 点击添加股票";
      this.statusBarItem.tooltip = "点击管理股票，开始您的看盘之旅";
      return;
    }

    if (!stockInfos || stockInfos.length === 0) {
      this.statusBarItem.text = "$(error) 股票获取失败";
      this.statusBarItem.tooltip = "请检查网络连接或股票代码是否正确";
      return;
    }

    const maxDisplayCount = config.getMaxDisplayCount();
    const displayStocks = stockInfos.slice(0, maxDisplayCount);
    const showMiniName = config.getShowMiniName();
    const stockMiniNames = config.getStockMiniNames();
    const showChangeValue = config.getShowChangeValue();
    const showLockCount = config.getShowLockCount();

    const stockTexts = displayStocks.map((stock) => {
      const symbol = isPriceUp(stock.changeValue) ? "↗" : "↘";
      const displayName = showMiniName
        ? stockMiniNames[stock.code] ||
          (stock.name.length > 2 ? stock.name.substring(0, 2) : stock.name)
        : stock.name;
      let text = `${displayName} ${stock.current} ${symbol}${stock.changePercent}%${showChangeValue ? `(${stock.changeValue})` : ""}`;
      if (
        showLockCount &&
        (stock.lockAmount ?? 0) > 0 &&
        isLockState(stock.priceType)
      ) {
        text += ` 封${formatAmount(stock.lockAmount ?? 0)}`;
      }
      return text;
    });

    const text = stockTexts.join(" | ");
    this.statusBarItem.text =
      stockInfos.length > maxDisplayCount
        ? `${text} ...(${stockInfos.length - maxDisplayCount}+)`
        : text;

    let tooltip = stockInfos
      .map((stock) => {
        const sign = isPriceUp(stock.changeValue) ? "+" : "";
        let line = `${stock.name}(${stock.code}): ${stock.current} ${sign}${stock.changePercent}%(${stock.changeValue})`;
        if (isLockState(stock.priceType)) {
          const type = stock.priceType === "up" ? "涨停" : "跌停";
          line += ` ${type}封单: ${formatAmount(stock.lockAmount ?? 0)}`;
        }
        return line;
      })
      .join("\n");

    if (stocks.length > stockInfos.length) {
      const failedCount = stocks.length - stockInfos.length;
      tooltip += `\n\n$(warning) ${failedCount}只股票获取失败`;
    }

    this.statusBarItem.tooltip = tooltip;
  }

  // 显示隐藏图标（已隐藏时跳过）
  setHidden(): void {
    if (this.hidden || !this.statusBarItem) return;
    this.hidden = true;
    this.statusBarItem.text = "$(eye-closed)";
    this.statusBarItem.tooltip = "状态栏股票信息已隐藏\n点击后选择'显示状态栏'";
  }

  getStatusBarItem(): vscode.StatusBarItem | null {
    return this.statusBarItem;
  }

  dispose(): void {
    this.statusBarItem?.dispose();
  }
}
