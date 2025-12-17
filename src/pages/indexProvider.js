/**
 * 股票首页视图提供者
 * 在侧边栏显示指数、板块和自选股票
 */

const vscode = require("vscode");
const { getStocks, getIndices, getSectors } = require("../config");
const { getStockList } = require("../services/stockService");

class IndexProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._stockData = { indices: [], sectors: [], stocks: [] };
    this._showPage = false;
  }

  setShowPage(visible) {
    this._showPage = visible;
    if (visible) {
      this.refresh();
    }
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      return [
        new StockCategory("指数", "indices"),
        new StockCategory("板块", "sectors"),
        new StockCategory("自选", "stocks"),
      ];
    }

    const stockMap = {
      indices: this._stockData.indices,
      sectors: this._stockData.sectors,
      stocks: this._stockData.stocks,
    };

    return stockMap[element.type]?.map((stock) => new StockItem(stock)) || [];
  }

  async refresh() {
    try {
      // 从配置获取指数代码
      const indexCodes = getIndices();
      // 从配置获取板块代码
      const sectorCodes = getSectors();
      // 获取用户自选股票
      const userStocks = getStocks();

      // 合并所有代码并去重,一次请求获取全部数据
      const allCodes = [
        ...new Set([...indexCodes, ...sectorCodes, ...userStocks]),
      ];
      const allData = await getStockList(allCodes);

      const sortByChange = (a, b) =>
        parseFloat(b.changePercent) - parseFloat(a.changePercent);

      this._stockData = {
        indices: allData.filter((stock) => indexCodes.includes(stock.code)),
        sectors: allData
          .filter((stock) => sectorCodes.includes(stock.code))
          .sort(sortByChange),
        stocks: allData
          .filter((stock) => userStocks.includes(stock.code))
          .sort(sortByChange),
      };

      this._onDidChangeTreeData.fire();
    } catch (error) {
      console.error("刷新数据失败:", error);
    }
  }

  updateData() {
    if (!this._showPage) {
      return;
    }
    this.refresh();
  }

  dispose() {
    this._onDidChangeTreeData.dispose();
  }
}

class StockCategory {
  constructor(label, type) {
    this.label = label;
    this.type = type;
    this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
  }
}

class StockItem {
  constructor(stock) {
    const isUp = parseFloat(stock.change) >= 0;
    this.label = `${stock.name} ${stock.current}`;
    this.description = `${isUp ? "+" : ""}${stock.changePercent}%`;
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    // 添加点击命令
    this.command = {
      command: "watch-stock.showStockDetail",
      title: "查看股票详情",
      arguments: [stock],
    };
  }
}

module.exports = IndexProvider;
