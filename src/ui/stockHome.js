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
  getStockList,
} = require("../services/stockService");
const { getStocks } = require("../configs/vscodeConfig");
const { INDEX_CODES, INDUSTRY_CODES } = require("../configs/staticConfig");

class StockHomePanel {
  static current = null;

  /** 行业板块代码列表（缓存） */
  static get INDUSTRY_CODE_LIST() {
    return INDUSTRY_CODES.map((item) => item.code);
  }

  constructor(panel) {
    this._panel = panel;
    this._disposables = [];
    this._stocks = [];
    this._indexStocks = [];
    this._industryStocks = [];
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
    switch (msg.type) {
      case "switchStock":
        this._activeCode = msg.code;
        await this._fetchAndSend(msg.code);
        break;
      case "refresh":
        if (this._activeCode) await this._fetchAndSend(this._activeCode, true);
        break;
      case "refreshIndex":
        await this._refreshIndexData();
        break;
      case "refreshIndustry":
        await this._refreshIndustryData();
        break;
    }
  }

  /** 行业板块代码列表（缓存） */
  static get INDUSTRY_CODE_LIST() {
    return INDUSTRY_CODES.map((item) => item.code);
  }

  /**
   * 将行业板块原始数据映射为带配置名称的结果
   */
  _mapIndustryData(industryData) {
    return (industryData || []).map((item) => {
      const config = INDUSTRY_CODES.find((c) => c.code === item.code);
      return {
        code: item.code,
        name: config?.name || item.name,
        changePercent: item.changePercent,
      };
    });
  }

  async _refreshIndexData() {
    this._indexStocks = (await getStockList(INDEX_CODES)) || [];
    this._panel.webview.postMessage({
      type: "indexData",
      indexStocks: this._indexStocks,
    });
  }

  async _refreshIndustryData() {
    const industryData = await getStockList(StockHomePanel.INDUSTRY_CODE_LIST);
    this._industryStocks = this._mapIndustryData(industryData);
    this._panel.webview.postMessage({
      type: "industryData",
      industryStocks: this._industryStocks,
    });
  }

  static async show() {
    const configStocks = getStocks();
    if (!configStocks.length) {
      vscode.window.showInformationMessage("请先添加股票");
      return;
    }

    const [quotes, indexData, industryData] = await Promise.all([
      getStockQuoteList(configStocks),
      getStockList(INDEX_CODES),
      getStockList(StockHomePanel.INDUSTRY_CODE_LIST),
    ]);

    if (!quotes.length) {
      vscode.window.showErrorMessage("获取股票数据失败，请检查网络连接");
      return;
    }

    const col = vscode.ViewColumn.One;
    const existing = StockHomePanel.current?._panel;

    if (existing) {
      existing.reveal(col);
      await StockHomePanel.current._load(quotes, indexData, industryData);
    } else {
      const newPanel = vscode.window.createWebviewPanel(
        "stockHome",
        "查看股票",
        col,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      StockHomePanel.current = new StockHomePanel(newPanel);
      await StockHomePanel.current._load(quotes, indexData, industryData);
    }
  }

  _convertToStockInfo(quote) {
    return {
      name: quote.name,
      code: quote.code,
      current: quote.current,
      changeValue: quote.changeValue,
      changePercent: quote.changePercent,
      preClose: quote.close,
      isETF: quote.isETF ?? false,
      dateTime: quote.dateTime,
    };
  }

  async _load(quotes, indexData = [], industryData = []) {
    this._quoteMap.clear();
    this._stocks = quotes.map((q) => {
      this._quoteMap.set(q.code, q);
      return this._convertToStockInfo(q);
    });
    this._indexStocks = indexData || [];
    this._industryStocks = this._mapIndustryData(industryData);

    this._activeCode = null;
    this._panel.title = "查看股票";
    this._panel.webview.html = this._buildHtml();

    await new Promise((r) => setTimeout(r, 100));

    this._panel.webview.postMessage({
      type: "init",
      stocks: this._stocks,
      indexStocks: this._indexStocks,
      industryStocks: this._industryStocks,
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

    const extractScript = (html) => {
      const m = html.match(/<script>([\s\S]*?)<\/script>/);
      return m ? m[1] : "";
    };
    const stripScript = (html) =>
      html.replace(/<script>[\s\S]*?<\/script>/, "").trim();

    const overviewRaw = read("stockOverview.html");
    const detailRaw = read("stockDetail.html");
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
