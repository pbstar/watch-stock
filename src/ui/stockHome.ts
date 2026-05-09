// 股票首页 WebviewPanel
import * as vscode from "vscode";
import * as crypto from "crypto";
import { sendMsg } from "../utils/msg";
import {
  getStockMinute,
  getStockQuoteList,
  getStockList,
} from "../services/stockService";
import {
  config,
  INDEX_CODES,
  INDUSTRY_CODES,
  INDUSTRY_CODE_LIST,
} from "../config";
import type { Stock, StockQuote, StockOverview, MinutePoint } from "../types";
import stockHomeHtml from "../webview/stockHome.html";
import stockOverviewHtml from "../webview/stockOverview.html";
import stockDetailHtml from "../webview/stockDetail.html";
import stockChartHtml from "../webview/stockChart.html";

// 分时数据缓存有效期：10秒
const MINUTE_CACHE_TTL = 10000;

interface MinuteCacheEntry {
  data: MinutePoint[];
  timestamp: number;
}

interface IndustryItem {
  code: string;
  name: string;
  changePercent: string;
}

interface InboundMessage {
  type:
    | "ready"
    | "switchStock"
    | "refresh"
    | "refreshIndex"
    | "refreshIndustry";
  code?: string;
}

// 提取 <script> 内容
function extractScript(html: string): string {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  return m ? m[1] : "";
}

// 移除 <script> 标签
function stripScript(html: string): string {
  return html.replace(/<script>[\s\S]*?<\/script>/, "").trim();
}

export class StockHomePanel {
  static current: StockHomePanel | null = null;

  private panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private stocks: StockOverview[] = [];
  private indexStocks: Stock[] = [];
  private industryStocks: IndustryItem[] = [];
  private activeCode: string | null = null;
  private quoteMap = new Map<string, StockQuote>();
  private minuteCache = new Map<string, MinuteCacheEntry>();
  // webview 就绪握手：每次重新设置 html 时重置
  private readyPromise: Promise<void> = Promise.resolve();
  private readyResolve: (() => void) | null = null;

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;

    this.panel.webview.onDidReceiveMessage(
      (msg: InboundMessage) => this.handleMessage(msg),
      null,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  // 入口：打开或切换面板
  static async show(): Promise<void> {
    const configStocks = config.getStocks();
    if (!configStocks.length) {
      sendMsg("请先添加股票", { type: "warning" });
      return;
    }

    const [quotes, indexData, industryData] = await Promise.all([
      getStockQuoteList(configStocks),
      getStockList(INDEX_CODES),
      getStockList(INDUSTRY_CODE_LIST),
    ]);

    if (!quotes.length) {
      sendMsg("获取股票数据失败，请检查网络连接", { type: "error" });
      return;
    }

    const col = vscode.ViewColumn.One;
    const existing = StockHomePanel.current?.panel;
    if (existing) {
      existing.reveal(col);
      await StockHomePanel.current!.load(quotes, indexData, industryData);
    } else {
      const newPanel = vscode.window.createWebviewPanel(
        "stockHome",
        "查看股票",
        col,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      StockHomePanel.current = new StockHomePanel(newPanel);
      await StockHomePanel.current.load(quotes, indexData, industryData);
    }
  }

  private async handleMessage(msg: InboundMessage): Promise<void> {
    switch (msg.type) {
      case "ready":
        this.readyResolve?.();
        break;
      case "switchStock":
        if (msg.code) {
          this.activeCode = msg.code;
          await this.fetchAndSend(msg.code);
        }
        break;
      case "refresh":
        if (this.activeCode) await this.fetchAndSend(this.activeCode, true);
        break;
      case "refreshIndex":
        await this.refreshIndexData();
        break;
      case "refreshIndustry":
        await this.refreshIndustryData();
        break;
    }
  }

  private mapIndustryData(industryData: Stock[]): IndustryItem[] {
    return (industryData || []).map((item) => {
      const cfg = INDUSTRY_CODES.find((c) => c.code === item.code);
      return {
        code: item.code,
        name: cfg?.name || item.name,
        changePercent: item.changePercent,
      };
    });
  }

  private async refreshIndexData(): Promise<void> {
    this.indexStocks = (await getStockList(INDEX_CODES)) || [];
    this.panel.webview.postMessage({
      type: "indexData",
      indexStocks: this.indexStocks,
    });
  }

  private async refreshIndustryData(): Promise<void> {
    const industryData = await getStockList(INDUSTRY_CODE_LIST);
    this.industryStocks = this.mapIndustryData(industryData);
    this.panel.webview.postMessage({
      type: "industryData",
      industryStocks: this.industryStocks,
    });
  }

  private convertToStockInfo(quote: StockQuote): StockOverview {
    return {
      name: quote.name,
      code: quote.code,
      current: quote.current,
      changeValue: quote.changeValue,
      changePercent: quote.changePercent,
      preClose: quote.close,
      isETF: quote.isETF,
      dateTime: quote.dateTime,
    };
  }

  private async load(
    quotes: StockQuote[],
    indexData: Stock[],
    industryData: Stock[],
  ): Promise<void> {
    this.quoteMap.clear();
    this.stocks = quotes.map((q) => {
      this.quoteMap.set(q.code, q);
      return this.convertToStockInfo(q);
    });
    this.indexStocks = indexData || [];
    this.industryStocks = this.mapIndustryData(industryData);

    this.activeCode = null;
    this.panel.title = "查看股票";
    // 重置 ready 握手，等 webview 加载完成后会回发 "ready" 消息
    this.readyPromise = new Promise((r) => {
      this.readyResolve = r;
    });
    this.panel.webview.html = this.buildHtml();
    await this.readyPromise;

    this.panel.webview.postMessage({
      type: "init",
      stocks: this.stocks,
      indexStocks: this.indexStocks,
      industryStocks: this.industryStocks,
      activeCode: null,
      quoteData: Object.fromEntries(this.quoteMap),
    });
  }

  private async fetchAndSend(
    code: string,
    forceRefresh = false,
  ): Promise<void> {
    const stockInfo = this.stocks.find((s) => s.code === code) || null;
    const quoteInfo = this.quoteMap.get(code) || null;

    const now = Date.now();
    const cached = this.minuteCache.get(code);
    if (!forceRefresh && cached && now - cached.timestamp < MINUTE_CACHE_TTL) {
      this.panel.webview.postMessage({
        type: "minuteData",
        code,
        data: cached.data,
        stockInfo,
        quoteInfo,
        cached: true,
      });
      return;
    }

    this.panel.webview.postMessage({ type: "loading", code });
    const data = await getStockMinute(code);
    this.minuteCache.set(code, { data, timestamp: now });
    this.panel.webview.postMessage({
      type: "minuteData",
      code,
      data,
      stockInfo,
      quoteInfo,
    });
  }

  private buildHtml(): string {
    const nonce = crypto.randomBytes(16).toString("base64url");
    const fragmentScripts = [
      extractScript(stockOverviewHtml),
      extractScript(stockDetailHtml),
      extractScript(stockChartHtml),
    ].join("\n");

    return stockHomeHtml
      .replace(/\{\{NONCE\}\}/g, nonce)
      .replace("{{OVERVIEW_HTML}}", stripScript(stockOverviewHtml))
      .replace("{{DETAIL_HTML}}", stripScript(stockDetailHtml))
      .replace("/* {{FRAGMENT_SCRIPTS}} */", fragmentScripts);
  }

  private dispose(): void {
    StockHomePanel.current = null;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
