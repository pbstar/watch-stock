// 股票面板：底部面板 WebviewView，跟随主循环推送行情
import * as vscode from "vscode";
import * as crypto from "crypto";
import { config } from "../config";
import {
  INDEX_CODES,
  INDUSTRY_CODES,
  INDUSTRY_CODE_LIST,
  RANK_SIZE,
  FLOW_SIZE,
  FLOW_FETCH_SIZE,
} from "../constants";
import {
  getStockList,
  getStockMinute,
  getStockQuoteList,
  getRankList,
  getMoneyFlowList,
  refreshAll,
} from "../services/marketApi";
import { isLockState } from "../utils/stock";
import { formatAmount, formatMoney } from "../shared/format";
import { formatClock } from "../utils/time";
import type { Stock, RankItem, MoneyFlowItem } from "../types";
import type { RowItem, FlowRowItem, Tab, ToHost, ToView } from "../shared/protocol";

// 行业代码 → 名称索引
const INDUSTRY_NAME_MAP = new Map(INDUSTRY_CODES.map((c) => [c.code, c.name]));

// 行情 → 列表行（面板空间充足，始终显示全称），封单仅涨跌停时显示
function toRow(stock: Stock): RowItem {
  const locked = isLockState(stock.priceType) && (stock.lockAmount ?? 0) > 0;
  return {
    code: stock.code,
    name: stock.name,
    current: stock.current,
    changePercent: stock.changePercent,
    changeValue: stock.changeValue,
    lock: locked ? `封 ${formatAmount(stock.lockAmount ?? 0)}` : "",
  };
}

// 排行行：字段与自选/指数一致，行内同样可展开详情
function toRankRow(item: RankItem): RowItem {
  return {
    code: item.code,
    name: item.name,
    current: item.current,
    changePercent: item.changePercent,
    changeValue: item.changeValue,
    lock: "",
  };
}

// 资金榜行：现价与涨跌幅仍按行情着色，第 6 列换成净额并按进出方向着色，
// 末列补净额占成交额比，弥补榜单看不到强弱程度的短板
function toFlowRow(item: MoneyFlowItem): FlowRowItem {
  return {
    code: item.code,
    name: item.name,
    current: item.current,
    changePercent: item.changePercent,
    netAmount: (item.netAmount > 0 ? "+" : "") + formatMoney(item.netAmount),
    netDir: item.netAmount >= 0 ? "up" : "dn",
    netRatio: `占 ${item.netRatio}%`,
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
  // 当前排行榜单包含的代码：展开行必然出自其中，换榜后旧代码不再拉详情
  private rankCodes: string[] = [];

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
    if (!this.view?.visible) return;
    this.postStocks();
    void this.pushTabData();
  }

  private post(msg: ToView): void {
    void this.view?.webview.postMessage(msg);
  }

  private postStocks(): void {
    this.post({
      type: "stocks",
      items: this.stocks.map(toRow),
      time: this.time,
      colorful: config.getEnableColorful(),
    });
  }

  private async handleMessage(msg: ToHost): Promise<void> {
    switch (msg.type) {
      case "ready":
        this.tab = msg.tab;
        this.postStocks();
        await this.pushTabData();
        break;
      case "tab":
        this.tab = msg.tab;
        this.expanded = null;
        await this.pushTabData();
        break;
      case "expand":
        this.expanded = msg.code;
        await this.pushDetail();
        break;
      case "refresh":
        // 主动刷新穿透全部接口缓存，避免又推一遍 TTL 内的旧数据
        refreshAll();
        if (this.tab === "mine") await this.refreshStocks();
        else await this.pushTabData();
        break;
    }
  }

  // 按当前 tab 拉取对应数据（仅可见时由调用方触发）
  private async pushTabData(): Promise<void> {
    if (this.tab === "index") {
      const list = await getStockList(INDEX_CODES);
      this.post({ type: "index", items: list.map(toRow) });
    } else if (this.tab === "sector") {
      const list = await getStockList(INDUSTRY_CODE_LIST);
      this.post({
        type: "sector",
        items: list.map((s) => ({
          name: INDUSTRY_NAME_MAP.get(s.code) || s.name,
          changePercent: s.changePercent,
        })),
      });
    } else if (this.tab === "rank") {
      // 四份榜单一起下发，面板内切换涨跌榜与资金榜都不再回扩展端
      const [up, down, inflowAll, outflowAll] = await Promise.all([
        getRankList(false, RANK_SIZE),
        getRankList(true, RANK_SIZE),
        getMoneyFlowList(false, FLOW_FETCH_SIZE),
        getMoneyFlowList(true, FLOW_FETCH_SIZE),
      ]);
      const inflow = inflowAll.slice(0, FLOW_SIZE).map(toFlowRow);
      const outflow = outflowAll.slice(0, FLOW_SIZE).map(toFlowRow);
      this.rankCodes = [
        ...up.map((r) => r.code),
        ...down.map((r) => r.code),
        ...inflow.map((r) => r.code),
        ...outflow.map((r) => r.code),
      ];
      this.post({
        type: "rank",
        up: up.map(toRankRow),
        down: down.map(toRankRow),
        inflow,
        outflow,
      });
    }
    // 板块不支持展开，其余 tab 的展开行都要随列表一起刷新
    if (this.tab !== "sector") await this.pushDetail();
  }

  // 当前 tab 的代码列表：展开行必然出自其中，配置变更把代码移出列表后不再为它拉详情
  private listCodes(): string[] {
    if (this.tab === "index") return INDEX_CODES;
    if (this.tab === "rank") return this.rankCodes;
    return config.getStocks();
  }

  // 展开行详情：完整行情与分时各自走接口缓存
  private async pushDetail(): Promise<void> {
    const code = this.expanded;
    if (!code || !this.listCodes().includes(code)) return;
    const [quotes, minute] = await Promise.all([
      getStockQuoteList([code]),
      getStockMinute(code),
    ]);
    this.post({ type: "detail", code, quote: quotes[0] ?? null, minute });
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
<span class="tab" data-tab="rank">排行</span>
<span class="time" id="time"></span>
<span class="refresh" title="刷新">↻</span>
<span class="subtabs">
<span class="subtab active" data-dir="up">涨幅榜</span>
<span class="subtab" data-dir="down">跌幅榜</span>
<span class="subtab" data-dir="inflow">流入榜</span>
<span class="subtab" data-dir="outflow">流出榜</span>
</span>
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
  }
}
