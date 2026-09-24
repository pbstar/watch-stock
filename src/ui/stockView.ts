// 股票面板：底部面板 WebviewView，跟随主循环推送行情
import * as vscode from "vscode";
import * as crypto from "crypto";
import { config } from "../config";
import {
  INDEX_CODES,
  INDUSTRY_CODES,
  INDUSTRY_CODE_LIST,
} from "../constants";
import {
  getStockList,
  getStockMinute,
  getStockQuoteList,
} from "../services/stockService";
import { formatAmount, getDisplayName } from "../utils/stock";
import { formatClock } from "../utils/time";
import type { Stock, MinutePoint } from "../types";
import type { RowItem, Tab, ToHost, ToView } from "../shared/protocol";

// 分时数据缓存有效期：10秒，避免每个刷新周期都拉分时
const MINUTE_CACHE_TTL = 10000;

// 行业代码 → 名称索引
const INDUSTRY_NAME_MAP = new Map(INDUSTRY_CODES.map((c) => [c.code, c.name]));

interface MinuteCacheEntry {
  data: MinutePoint[];
  timestamp: number;
}

// 行情 → 列表行，封单仅涨跌停时显示
function toRow(stock: Stock, name = stock.name): RowItem {
  const locked =
    (stock.priceType === "up" || stock.priceType === "down") &&
    (stock.lockAmount ?? 0) > 0;
  return {
    code: stock.code,
    name,
    current: stock.current,
    changePercent: stock.changePercent,
    changeValue: stock.changeValue,
    lock: locked ? `封 ${formatAmount(stock.lockAmount ?? 0)}` : "",
  };
}

export class StockViewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  static readonly viewId = "watch-stock.view";

  private view: vscode.WebviewView | null = null;
  private disposables: vscode.Disposable[] = [];
  private tab: Tab = "mine";
  private expanded: string | null = null;
  private stocks: Stock[] = [];
  private time = "";
  private minuteCache = new Map<string, MinuteCacheEntry>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    // 手动刷新自选行情：走 refresher 主链路，刷新完成后会回调 update
    private readonly refreshStocks: () => Promise<void>,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.disposeView();
    this.view = view;
    const distUri = vscode.Uri.joinPath(this.extensionUri, "dist");
    view.webview.options = { enableScripts: true, localResourceRoots: [distUri] };
    view.webview.html = this.buildHtml(view.webview, distUri);
    // 不保留隐藏时的上下文：隐藏即销毁页面，重新可见时 webview 重新加载并发送 ready
    this.disposables.push(
      view.webview.onDidReceiveMessage((msg: ToHost) => this.handleMessage(msg)),
      view.onDidDispose(() => this.disposeView()),
    );
  }

  // 面板当前是否可见（切到其他 tab、面板收起或一键隐藏时为 false）
  get visible(): boolean {
    return this.view?.visible ?? false;
  }

  // refresher 每次刷新后调用，面板不可见时只缓存不推送
  update(stocks: Stock[], now: Date): void {
    this.stocks = stocks;
    this.time = formatClock(now);
    // 展开的股票已从自选移除时收起，避免继续为它拉详情（以配置为准，行情拉取失败不误收）
    if (this.expanded && !config.getStocks().includes(this.expanded)) {
      this.expanded = null;
    }
    if (!this.view?.visible) return;
    this.postStocks();
    void this.pushTabData();
  }

  private post(msg: ToView): void {
    void this.view?.webview.postMessage(msg);
  }

  // 自选名称与状态栏一致，跟随简称配置
  private postStocks(): void {
    const showMiniName = config.getShowMiniName();
    const miniNames = config.getStockMiniNames();
    this.post({
      type: "stocks",
      items: this.stocks.map((s) =>
        toRow(s, getDisplayName(s.code, s.name, showMiniName, miniNames)),
      ),
      time: this.time,
      colorful: config.getEnableColorful(),
    });
  }

  private async handleMessage(msg: ToHost): Promise<void> {
    switch (msg.type) {
      case "ready":
        this.tab = msg.tab;
        this.expanded = msg.expanded;
        this.postStocks();
        await this.pushTabData();
        break;
      case "tab":
        this.tab = msg.tab;
        await this.pushTabData();
        break;
      case "expand":
        this.expanded = msg.code;
        await this.pushDetail();
        break;
      case "refresh":
        if (this.expanded) this.minuteCache.delete(this.expanded);
        if (this.tab === "mine") await this.refreshStocks();
        else await this.pushTabData();
        break;
    }
  }

  // 按当前 tab 拉取对应数据（仅可见时由调用方触发）
  private async pushTabData(): Promise<void> {
    if (this.tab === "index") {
      const list = await getStockList(INDEX_CODES);
      this.post({ type: "index", items: list.map((s) => toRow(s)) });
    } else if (this.tab === "sector") {
      const list = await getStockList(INDUSTRY_CODE_LIST);
      this.post({
        type: "sector",
        items: list.map((s) => ({
          name: INDUSTRY_NAME_MAP.get(s.code) || s.name,
          changePercent: s.changePercent,
        })),
      });
    } else {
      await this.pushDetail();
    }
  }

  // 展开行详情：完整行情每次拉取，分时走 TTL 缓存
  private async pushDetail(): Promise<void> {
    const code = this.expanded;
    if (!code) return;
    const [quotes, minute] = await Promise.all([
      getStockQuoteList([code]),
      this.getMinute(code),
    ]);
    this.post({ type: "detail", code, quote: quotes[0] ?? null, minute });
  }

  private async getMinute(code: string): Promise<MinutePoint[]> {
    const now = Date.now();
    const cached = this.minuteCache.get(code);
    if (cached && now - cached.timestamp < MINUTE_CACHE_TTL) return cached.data;
    const data = await getStockMinute(code);
    this.minuteCache.set(code, { data, timestamp: now });
    return data;
  }

  private buildHtml(webview: vscode.Webview, distUri: vscode.Uri): string {
    const nonce = crypto.randomBytes(16).toString("base64url");
    const script = webview.asWebviewUri(vscode.Uri.joinPath(distUri, "webview.js"));
    const style = webview.asWebviewUri(
      vscode.Uri.joinPath(distUri, "webview-style.css"),
    );
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${style}">
</head>
<body>
<div class="bar">
<span class="tab" data-tab="mine">自选</span>
<span class="tab" data-tab="index">指数</span>
<span class="tab" data-tab="sector">板块</span>
<span class="time" id="time"></span>
<span class="refresh" title="刷新">↻</span>
</div>
<div id="content"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  private disposeView(): void {
    this.view = null;
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  dispose(): void {
    this.disposeView();
    this.minuteCache.clear();
  }
}
