// 股票面板：底部面板 WebviewView，跟随主循环推送行情
import * as vscode from "vscode";
import { config } from "../config";
import { refreshAll } from "../services/marketApi";
import { formatClock } from "../utils/time";
import { loadDetail, loadTab } from "./panelData";
import { buildPanelHtml } from "./viewHtml";
import { toRow } from "./viewRows";
import type { Stock } from "../types";
import type { Tab, ToHost, ToView } from "../shared/protocol";

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
  // 当前标签列表包含的代码：展开行必然出自其中，换榜后旧代码不再拉详情
  private listCodes: string[] = [];

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
    view.webview.html = buildPanelHtml(view.webview, distUri);
    // 不保留隐藏时的上下文：隐藏即销毁页面，重新可见时 webview 重新加载并请求数据
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
      case "tab":
        // 首次加载与切标签共用：面板重建后靠这条消息拿到首屏数据
        this.tab = msg.tab;
        this.expanded = null;
        this.postStocks();
        await this.pushTabData();
        break;
      case "expand":
        this.expanded = msg.code;
        await this.pushDetail();
        break;
      case "refresh":
        // 主动刷新穿透全部接口缓存，避免又推一遍 TTL 内的旧数据
        refreshAll();
        // 统一走主循环链路：它会推送自选行情（带时间）、当前标签的数据与状态栏。
        // 此前只刷当前标签，非自选标签拿不到新时间戳，点刷新像没反应
        await this.refreshStocks();
        break;
    }
  }

  // 按当前标签拉取对应数据（仅可见时由调用方触发）
  private async pushTabData(): Promise<void> {
    const { msg, codes } = await loadTab(this.tab);
    this.listCodes = codes;
    if (msg) this.post(msg);
    // 板块不支持展开，其余标签的展开行都要随列表一起刷新
    if (this.tab !== "sector") await this.pushDetail();
  }

  // 展开行详情：股票已不在当前列表里（换榜、被移除）时不再拉
  private async pushDetail(): Promise<void> {
    const code = this.expanded;
    if (!code || !this.listCodes.includes(code)) return;
    this.post(await loadDetail(code));
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
