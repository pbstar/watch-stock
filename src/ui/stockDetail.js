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

class StockDetailPanel {
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
    const panel = StockDetailPanel.current?._panel;

    if (panel) {
      panel.reveal(col);
      await StockDetailPanel.current._load(quotes);
    } else {
      const newPanel = vscode.window.createWebviewPanel(
        "stockDetail",
        "查看股票",
        col,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      StockDetailPanel.current = new StockDetailPanel(newPanel);
      await StockDetailPanel.current._load(quotes);
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

    this._activeCode = this._stocks[0]?.code || null;
    this._panel.title = "查看股票";
    this._panel.webview.html = this._buildHtml();

    await new Promise((r) => setTimeout(r, 100));

    this._panel.webview.postMessage({
      type: "init",
      stocks: this._stocks,
      activeCode: this._activeCode,
      quoteData: Object.fromEntries(this._quoteMap),
    });

    if (this._activeCode) {
      await this._fetchAndSend(this._activeCode);
    }
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
    const htmlPath = path.join(__dirname, "../webview/stockDetail.html");
    const html = fs.readFileSync(htmlPath, "utf8");
    return html.replace(/\{\{NONCE\}\}/g, nonce);
  }

  _dispose() {
    StockDetailPanel.current = null;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop().dispose();
    }
  }
}

module.exports = StockDetailPanel;
