/**
 * 股票分时图 WebviewPanel
 */

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { getStockMinute } = require("../services/stockService");

class StockDetailPanel {
  static current = null;

  constructor(panel) {
    this._panel = panel;
    this._disposables = [];
    this._stocks = [];
    this._activeCode = null;

    // 监听 webview 消息
    this._panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.type === "switchStock") {
          this._activeCode = msg.code;
          await this._fetchAndSend(msg.code);
        } else if (msg.type === "refresh") {
          if (this._activeCode) await this._fetchAndSend(this._activeCode);
        }
      },
      null,
      this._disposables,
    );

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
  }

  /**
   * 打开或刷新面板
   * @param {object[]} stockInfos 股票数据列表
   * @param {string} [initialCode] 初始选中代码
   */
  static async show(stockInfos, initialCode) {
    const col = vscode.ViewColumn.Two;

    if (StockDetailPanel.current) {
      StockDetailPanel.current._panel.reveal(col);
      await StockDetailPanel.current._load(stockInfos, initialCode);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "stockDetail",
      "查看股票",
      col,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    StockDetailPanel.current = new StockDetailPanel(panel);
    await StockDetailPanel.current._load(stockInfos, initialCode);
  }

  async _load(stockInfos, initialCode) {
    this._stocks = stockInfos;
    this._activeCode = initialCode || stockInfos[0]?.code || null;

    const activeName =
      stockInfos.find((s) => s.code === this._activeCode)?.name || "";
    this._panel.title = activeName ? `查看股票 - ${activeName}` : "查看股票";
    this._panel.webview.html = this._buildHtml();

    // 等待 webview 初始化完成
    await new Promise((r) => setTimeout(r, 100));

    this._panel.webview.postMessage({
      type: "init",
      stocks: stockInfos,
      activeCode: this._activeCode,
    });

    if (this._activeCode) {
      await this._fetchAndSend(this._activeCode);
    }
  }

  async _fetchAndSend(code) {
    this._panel.webview.postMessage({ type: "loading", code });
    const stockInfo = this._stocks.find((s) => s.code === code) || null;
    const data = await getStockMinute(code);
    this._panel.webview.postMessage({
      type: "minuteData",
      code,
      data,
      stockInfo,
    });
  }

  _buildHtml() {
    const nonce = crypto.randomBytes(16).toString("base64url");
    const htmlPath = path.join(__dirname, "../webview/stockDetail.html");
    const html = fs.readFileSync(htmlPath, "utf8");
    return html.replace(/\{\{NONCE\}\}/g, nonce);
  }

  _dispose() {
    StockDetailPanel.current = null;
    this._panel.dispose();
    while (this._disposables.length) this._disposables.pop().dispose();
  }
}

module.exports = StockDetailPanel;
