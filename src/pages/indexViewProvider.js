/**
 * 股票首页视图提供者
 * 在侧边栏显示指数和自选股票
 */

const vscode = require("vscode");
const { getStocks } = require("../config");
const { getStocksInfo } = require("../services/stockService");

/**
 * 构造函数
 */
function IndexViewProvider(context) {
  this._context = context;
  this._onDidChangeTreeData = new vscode.EventEmitter();
  this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  this._stockData = { indices: [], sectors: [], stocks: [] };
  this._refreshTimer = null;

  // 定时刷新
  const self = this;
  this._refreshTimer = setInterval(function () {
    self.refresh();
  }, 5000);

  // 初始加载
  this.refresh();
}

/**
 * 获取树节点
 */
IndexViewProvider.prototype.getTreeItem = function (element) {
  return element;
};

/**
 * 获取子节点
 */
IndexViewProvider.prototype.getChildren = function (element) {
  if (!element) {
    // 根节点:返回分类
    return [
      new StockCategory("指数", "indices"),
      new StockCategory("板块", "sectors"),
      new StockCategory("自选", "stocks"),
    ];
  }

  // 子节点:返回股票列表
  if (element.type === "indices") {
    return this._stockData.indices.map(function (stock) {
      return new StockItem(stock);
    });
  } else if (element.type === "sectors") {
    return this._stockData.sectors.map(function (stock) {
      return new StockItem(stock);
    });
  } else if (element.type === "stocks") {
    return this._stockData.stocks.map(function (stock) {
      return new StockItem(stock);
    });
  }

  return [];
};

/**
 * 刷新数据
 */
IndexViewProvider.prototype.refresh = async function () {
  const self = this;

  // 获取主要指数
  const indexCodes = ["sh000001", "sz399001", "sz399006"];
  // 热门板块代码(可根据需要调整)
  const sectorCodes = ["sh512760", "sh512690", "sh512170", "sh515790"];
  // 获取用户自选股票
  const userStocks = await getStocks();

  Promise.all([
    getStocksInfo(indexCodes),
    getStocksInfo(sectorCodes),
    getStocksInfo(userStocks),
  ])
    .then(function (results) {
      const indexData = results[0];
      const sectorData = results[1];
      const userData = results[2];

      // 按涨跌幅降序排序
      const sortByChange = function (a, b) {
        return parseFloat(b.changePercent) - parseFloat(a.changePercent);
      };

      self._stockData = {
        indices: indexData.sort(sortByChange),
        sectors: sectorData.sort(sortByChange),
        stocks: userData.sort(sortByChange),
      };
      self._onDidChangeTreeData.fire();
    })
    .catch(function (error) {
      console.error("刷新数据失败:", error);
    });
};

/**
 * 股票分类节点
 */
function StockCategory(label, type) {
  this.label = label;
  this.type = type;
  this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
}

/**
 * 股票项节点
 */
function StockItem(stock) {
  const isUp = parseFloat(stock.change) >= 0;
  const symbol = isUp ? "+" : "";

  this.label = stock.name + " " + stock.current;
  this.description = symbol + stock.changePercent + "%";
  this.tooltip =
    stock.name +
    " (" +
    stock.code +
    ")\n" +
    "当前: " +
    stock.current +
    "\n" +
    "涨跌: " +
    symbol +
    stock.change +
    " (" +
    symbol +
    stock.changePercent +
    "%)";

  // 设置图标颜色
  this.iconPath = isUp
    ? new vscode.ThemeIcon("arrow-up")
    : new vscode.ThemeIcon("arrow-down");

  this.collapsibleState = vscode.TreeItemCollapsibleState.None;
}

/**
 * 清理资源
 */
IndexViewProvider.prototype.dispose = function () {
  if (this._refreshTimer) {
    clearInterval(this._refreshTimer);
    this._refreshTimer = null;
  }
};

module.exports = IndexViewProvider;
