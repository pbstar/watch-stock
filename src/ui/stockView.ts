// 股票面板：底部面板 WebviewView，自选复用主循环行情，其余列表到点独立刷新
import * as vscode from "vscode";
import { config } from "../config";
import { FLOW_CACHE_TTL, RANK_CACHE_TTL } from "../constants";
import { clearMarketCache } from "../services/marketApi";
import { formatClock } from "../utils/time";
import { loadDetail, loadList } from "./panelData";
import { buildPanelHtml } from "./viewHtml";
import { toRow } from "./viewRows";
import type { Stock } from "../types";
import type {
  ListKey,
  RankDir,
  RowItem,
  Tab,
  ToHost,
  ToView,
} from "../shared/protocol";

// 列表的刷新周期：行情类（自选/指数/板块）跟随主循环每轮刷新，返回 0 即每轮都到点；
// 涨跌榜、资金榜变化慢，用各自接口缓存的有效期做周期，保证刷新时拿到的确实是新数据
function intervalOf(key: ListKey): number {
  if (key === "up" || key === "down") return RANK_CACHE_TTL;
  if (key === "inflow" || key === "outflow") return FLOW_CACHE_TTL;
  return 0;
}

export class StockViewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  static readonly viewId = "watch-stock.view";

  private view: vscode.WebviewView | null = null;
  private disposables: vscode.Disposable[] = [];
  private tab: Tab = "mine";
  private rankDir: RankDir = "up";
  private expanded: string | null = null;
  // 当前列表包含的代码：展开行必然出自其中，换列表后旧代码不再拉详情
  private listCodes: string[] = [];
  // 主循环最近一次推送的自选行情，切回自选时先展示这一份
  private mine: { items: RowItem[]; time: string } = { items: [], time: "" };
  // 其余列表最近一次取数的起点：主循环按各列表周期判断是否到点刷新
  private refreshedAt: Partial<Record<ListKey, number>> = {};

  constructor(
    private readonly extensionUri: vscode.Uri,
    // 手动刷新走主循环：自选与状态栏共用一次取数，当前列表在本轮强制刷新
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
      view.onDidChangeVisibility(() => this.handleVisibility()),
    );
  }

  // 面板当前是否可见（切到其他 tab、面板收起或一键隐藏时为 false）
  get visible(): boolean {
    return this.view?.visible ?? false;
  }

  // 当前展示的列表：排行标签下由所选子榜决定
  private get activeKey(): ListKey {
    return this.tab === "rank" ? this.rankDir : this.tab;
  }

  private post(msg: ToView): void {
    void this.view?.webview.postMessage(msg);
  }

  // 主循环每个周期调用：自选行情直接复用状态栏这一份，其余列表到点才刷新
  onMainTick(stocks: Stock[], now: Date): void {
    this.mine = { items: stocks.map(toRow), time: formatClock(now) };
    if (!this.view?.visible) return;
    if (this.activeKey === "mine") {
      this.showMine();
      void this.pushDetail();
      return;
    }
    if (this.isDue(this.activeKey, now)) void this.refreshActive();
  }

  private isDue(key: ListKey, now: Date): boolean {
    const last = this.refreshedAt[key];
    return last === undefined || now.getTime() - last >= intervalOf(key);
  }

  // 手动刷新前调用：清掉当前列表的到点判断，让本轮主循环一定刷新它
  forceNextRefresh(): void {
    delete this.refreshedAt[this.activeKey];
  }

  private async handleMessage(msg: ToHost): Promise<void> {
    switch (msg.type) {
      case "tab":
        // 首次加载与切标签共用：面板重建后靠这条消息拿到首屏数据
        this.tab = msg.tab;
        this.rankDir = msg.dir;
        this.expanded = null;
        this.postColorful();
        await this.refreshActive();
        break;
      case "rank":
        this.rankDir = msg.dir;
        await this.refreshActive();
        break;
      case "expand":
        this.expanded = msg.code;
        await this.pushDetail();
        break;
      case "refresh":
        // 穿透接口缓存，并让本轮主循环强制刷新当前列表
        clearMarketCache();
        this.forceNextRefresh();
        await this.refreshStocks();
        break;
    }
  }

  // 刷新当前列表：自选直接展示主循环最近一份行情，其余只取当前这一份
  private async refreshActive(): Promise<void> {
    const key = this.activeKey;
    if (key === "mine") {
      this.showMine();
      await this.pushDetail();
      return;
    }
    const startedAt = Date.now();
    const { msg, codes } = await loadList(key);
    // 取数期间切走了列表就丢弃这批结果，避免覆盖新列表的 listCodes
    if (key !== this.activeKey) return;
    this.refreshedAt[key] = startedAt;
    this.listCodes = codes;
    this.post(msg);
    // 板块不支持展开，其余列表的展开行随列表一起刷新
    if (key !== "sector") await this.pushDetail();
  }

  // 自选列表直接展示主循环最近一次推送的行情，不再单独取数
  private showMine(): void {
    this.listCodes = this.mine.items.map((r) => r.code);
    this.post({ type: "mine", ...this.mine });
  }

  // 展开行详情：股票已不在当前列表里（换榜、被移除）时不再拉
  private async pushDetail(): Promise<void> {
    const code = this.expanded;
    if (!code || !this.listCodes.includes(code)) return;
    this.post(await loadDetail(code));
  }

  private handleVisibility(): void {
    if (!this.view?.visible) return;
    // 隐藏期间可能改过颜色配置，重新可见时一并同步
    this.postColorful();
    void this.refreshActive();
  }

  private postColorful(): void {
    this.post({ type: "colorful", value: config.getEnableColorful() });
  }

  // 配置变更：颜色开关即时生效；自选增删与排序由主循环的下一次刷新自然带上
  onConfigChanged(e: vscode.ConfigurationChangeEvent): void {
    if (e.affectsConfiguration("watch-stock.enableColorful")) this.postColorful();
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
