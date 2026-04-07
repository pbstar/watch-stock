/**
 * 股票分时图 WebviewPanel
 */

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const {
  getStockMinute,
  getStockQuoteList,
} = require("../services/stockService");
const { getStocks } = require("../config");

class StockHomePanel {
  static current = null;

  constructor(panel) {
    this._panel = panel;
    this._disposables = [];
    this._stocks = [];
    this._activeCode = null;
    this._quoteMap = new Map();
    this._minuteCache = new Map();

    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables,
    );

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
  }

  async _handleMessage(msg) {
    if (msg.type === "switchStock") {
      this._activeCode = msg.code;
      await this._fetchAndSend(msg.code);
    } else if (msg.type === "refresh" && this._activeCode) {
      await this._fetchAndSend(this._activeCode, true);
    }
  }

  static async show() {
    const configStocks = getStocks();
    if (!configStocks.length) {
      vscode.window.showInformationMessage("请先添加股票");
      return;
    }

    const quotes = await getStockQuoteList(configStocks);
    if (!quotes.length) {
      vscode.window.showErrorMessage("获取股票数据失败，请检查网络连接");
      return;
    }

    const col = vscode.ViewColumn.One;
    const panel = StockHomePanel.current?._panel;

    if (panel) {
      panel.reveal(col);
      await StockHomePanel.current._load(quotes);
    } else {
      const newPanel = vscode.window.createWebviewPanel(
        "stockHome",
        "查看股票",
        col,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      StockHomePanel.current = new StockHomePanel(newPanel);
      await StockHomePanel.current._load(quotes);
    }
  }

  _convertToStockInfo(quote) {
    return {
      name: quote.name,
      code: quote.code,
      current: quote.price.toFixed(2),
      changeValue: (quote.price - quote.close).toFixed(2),
      changePercent: quote.changePercent.toFixed(2),
      preClose: quote.close.toFixed(2),
      isETF: false,
      dateTime: "",
    };
  }

  async _load(quotes) {
    this._quoteMap.clear();
    this._stocks = quotes.map((q) => {
      this._quoteMap.set(q.code, q);
      return this._convertToStockInfo(q);
    });

    // 初始停留在 A股全览 tab，不预设激活股票
    this._activeCode = null;
    this._panel.title = "查看股票";
    this._panel.webview.html = this._buildHtml();

    await new Promise((r) => setTimeout(r, 100));

    this._panel.webview.postMessage({
      type: "init",
      stocks: this._stocks,
      activeCode: null,
      quoteData: Object.fromEntries(this._quoteMap),
    });
  }

  async _fetchAndSend(code, forceRefresh = false) {
    this._panel.webview.postMessage({ type: "loading", code });
    const stockInfo = this._stocks.find((s) => s.code === code) || null;
    const quoteInfo = this._quoteMap.get(code) || null;

    const now = Date.now();
    const cached = this._minuteCache.get(code);
    if (!forceRefresh && cached && now - cached.timestamp < 10000) {
      this._panel.webview.postMessage({
        type: "minuteData",
        code,
        data: cached.data,
        stockInfo,
        quoteInfo,
        cached: true,
      });
      return;
    }

    const data = await getStockMinute(code);
    this._minuteCache.set(code, { data, timestamp: now });
    this._panel.webview.postMessage({
      type: "minuteData",
      code,
      data,
      stockInfo,
      quoteInfo,
    });
  }

  _buildHtml() {
    const nonce = crypto.randomBytes(16).toString("base64url");
    const read = (name) =>
      fs.readFileSync(path.join(__dirname, "../webview", name), "utf8");

    // 从 HTML 片段中提取 <script> 内容，并返回去掉 script 标签后的 HTML
    const extractScript = (html) => {
      const m = html.match(/<script>([\s\S]*?)<\/script>/);
      return m ? m[1] : "";
    };
    const stripScript = (html) =>
      html.replace(/<script>[\s\S]*?<\/script>/, "").trim();

    const overviewRaw = read("stockOverview.html");
    const detailRaw = read("stockDetail.html");
    // 各片段的 script 内容合并为 {{FRAGMENT_SCRIPTS}}
    const fragmentScripts = [
      extractScript(overviewRaw),
      extractScript(detailRaw),
    ].join("\n");

    return read("stockHome.html")
      .replace(/\{\{NONCE\}\}/g, nonce)
      .replace("/* {{CHART_JS}} */", read("stockChart.js"))
      .replace("{{OVERVIEW_HTML}}", stripScript(overviewRaw))
      .replace("{{DETAIL_HTML}}", stripScript(detailRaw))
      .replace("/* {{FRAGMENT_SCRIPTS}} */", fragmentScripts);
  }

  _dispose() {
    StockHomePanel.current = null;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop().dispose();
    }
  }
}

module.exports = StockHomePanel;
