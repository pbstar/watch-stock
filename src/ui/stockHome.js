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
const { getStocks } = require("../config");

class StockHomePanel {
  static current = null;

  // 大盘指数代码
  static INDEX_CODES = [
    "sh000001",
    "sz399001",
    "sz399006",
    "sh000688",
    "sz399300",
    "sh000016",
  ];
  // 行业板块代码
  static INDUSTRY_CODES = [
    {
      code: "sh512880",
      name: "证券",
    },
    {
      code: "sz159326",
      name: "电网设备",
    },
    {
      code: "sh512400",
      name: "有色金属",
    },
    {
      code: "sh512480",
      name: "半导体",
    },
    {
      code: "sz159928",
      name: "消费",
    },
    {
      code: "sz159206",
      name: "卫星",
    },
    {
      code: "sh512690",
      name: "白酒",
    },
    {
      code: "sh512010",
      name: "医药",
    },
    {
      code: "sh515880",
      name: "通信",
    },
    {
      code: "sh512710",
      name: "军工",
    },
    {
      code: "sh515980",
      name: "人工智能",
    },
    {
      code: "sh515220",
      name: "煤炭",
    },
    {
      code: "sz159869",
      name: "游戏",
    },
    {
      code: "sh512760",
      name: "芯片",
    },
    {
      code: "sh516160",
      name: "新能源",
    },
    {
      code: "sh562800",
      name: "稀有金属",
    },
    {
      code: "sz159766",
      name: "旅游",
    },
    {
      code: "sh512980",
      name: "传媒",
    },
    {
      code: "sh515170",
      name: "食品饮料",
    },
    {
      code: "sh515290",
      name: "银行",
    },
    {
      code: "sh515230",
      name: "软件",
    },
    {
      code: "sh561360",
      name: "石油",
    },
    {
      code: "sh510230",
      name: "金融",
    },
    {
      code: "sh512290",
      name: "生物医药",
    },
    {
      code: "sz159516",
      name: "半导体设备",
    },
    {
      code: "sh515210",
      name: "钢铁",
    },
    {
      code: "sh512670",
      name: "国防",
    },
    {
      code: "sh159625",
      name: "绿色电力",
    },
    {
      code: "sh562500",
      name: "机器人",
    },
    {
      code: "sz159611",
      name: "电力",
    },
    {
      code: "sh560080",
      name: "中药",
    },
    {
      code: "sz159870",
      name: "化工",
    },
    {
      code: "sz159930",
      name: "能源",
    },
    {
      code: "sz159992",
      name: "创新药",
    },
    {
      code: "sh516970",
      name: "基建",
    },
    {
      code: "sz159840",
      name: "锂电池",
    },
    {
      code: "sh516150",
      name: "稀土",
    },
    {
      code: "sz159865",
      name: "养殖",
    },
    {
      code: "sz159755",
      name: "电池",
    },
    {
      code: "sh516630",
      name: "云计算",
    },
    {
      code: "sh515790",
      name: "光伏",
    },
    {
      code: "sh512200",
      name: "房地产",
    },
    {
      code: "sz159996",
      name: "家电",
    },
    {
      code: "sz159227",
      name: "航空航天",
    },
    {
      code: "sh516520",
      name: "智能驾驶",
    },
    {
      code: "sh516620",
      name: "影视",
    },
  ];

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
    if (msg.type === "switchStock") {
      this._activeCode = msg.code;
      await this._fetchAndSend(msg.code);
    } else if (msg.type === "refresh" && this._activeCode) {
      await this._fetchAndSend(this._activeCode, true);
    } else if (msg.type === "refreshIndex") {
      await this._refreshIndexData();
    } else if (msg.type === "refreshIndustry") {
      await this._refreshIndustryData();
    }
  }

  async _refreshIndexData() {
    const indexData = await getStockList(StockHomePanel.INDEX_CODES);
    this._indexStocks = indexData || [];
    this._panel.webview.postMessage({
      type: "indexData",
      indexStocks: this._indexStocks,
    });
  }

  async _refreshIndustryData() {
    const industryCodes = StockHomePanel.INDUSTRY_CODES.map(
      (item) => item.code,
    );
    const industryData = await getStockList(industryCodes);
    this._industryStocks = (industryData || []).map((item) => {
      const config = StockHomePanel.INDUSTRY_CODES.find(
        (c) => c.code === item.code,
      );
      return {
        code: item.code,
        name: config?.name || item.name,
        changePercent: item.changePercent,
      };
    });
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

    const industryCodes = StockHomePanel.INDUSTRY_CODES.map(
      (item) => item.code,
    );
    const [quotes, indexData, industryData] = await Promise.all([
      getStockQuoteList(configStocks),
      getStockList(StockHomePanel.INDEX_CODES),
      getStockList(industryCodes),
    ]);
    if (!quotes.length) {
      vscode.window.showErrorMessage("获取股票数据失败，请检查网络连接");
      return;
    }

    const col = vscode.ViewColumn.One;
    const panel = StockHomePanel.current?._panel;

    if (panel) {
      panel.reveal(col);
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
      current: quote.price.toFixed(2),
      changeValue: (quote.price - quote.close).toFixed(2),
      changePercent: quote.changePercent.toFixed(2),
      preClose: quote.close.toFixed(2),
      isETF: false,
      dateTime: "",
    };
  }

  async _load(quotes, indexData = [], industryData = []) {
    this._quoteMap.clear();
    this._stocks = quotes.map((q) => {
      this._quoteMap.set(q.code, q);
      return this._convertToStockInfo(q);
    });
    this._indexStocks = indexData || [];
    this._industryStocks = (industryData || []).map((item) => {
      const config = StockHomePanel.INDUSTRY_CODES.find(
        (c) => c.code === item.code,
      );
      return {
        code: item.code,
        name: config?.name || item.name,
        changePercent: item.changePercent,
      };
    });
    // 初始停留在 A股全览 tab，不预设激活股票
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
