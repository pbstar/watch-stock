/**
 * 摸鱼看盘 - VS Code股票实时查看插件
 *
 * 功能特点：
 * - 实时显示股票价格信息
 * - 支持股票代码和中文名称搜索
 * - 状态栏显示，不影响编码
 * - 可管理多只股票
 * - 定时自动刷新数据
 */

const vscode = require("vscode");
const axios = require("axios");
const iconv = require("iconv-lite");

// 全局变量
let statusBarItem; // 状态栏项
let refreshInterval; // 刷新定时器
let stocks = []; // 股票列表
let isVisible = true; // 是否显示股票信息

/**
 * 插件激活函数
 * 初始化状态栏、加载配置、注册命令
 */
function activate(context) {
  console.log("摸鱼看盘插件已启动");

  // 创建状态栏项 - 显示在左侧最后位置
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0
  );
  statusBarItem.command = "watch-stock.manageStock";
  statusBarItem.show();

  // 加载用户配置
  const config = vscode.workspace.getConfiguration("watch-stock");
  stocks = config.get("stocks", ["000001"]);

  // 注册命令
  const addStockCommand = vscode.commands.registerCommand(
    "watch-stock.addStock",
    async () => {
      const input = await vscode.window.showInputBox({
        prompt: "请输入股票代码或名称",
        placeHolder: "例如: sh600519 或 sz000001 或 贵州茅台",
      });

      if (input && input.trim()) {
        const stockInput = input.trim();

        // 验证股票是否存在
        const stockInfo = await getStockInfo(stockInput);
        if (stockInfo && stockInfo.name) {
          if (!stocks.includes(stockInput)) {
            stocks.push(stockInput);
            await config.update(
              "stocks",
              stocks,
              vscode.ConfigurationTarget.Global
            );
            vscode.window.showInformationMessage(
              `已添加: ${stockInfo.name}(${stockInfo.code})`
            );
            updateStockInfo();
          } else {
            vscode.window.showWarningMessage("该股票已存在");
          }
        } else {
          vscode.window.showErrorMessage("股票获取失败，请检查股票代码或名称");
        }
      }
    }
  );

  const removeStockCommand = vscode.commands.registerCommand(
    "watch-stock.removeStock",
    async () => {
      if (stocks.length === 0) {
        vscode.window.showInformationMessage("当前没有添加任何股票");
        return;
      }

      // 获取股票名称用于显示
      const stockOptions = await Promise.all(
        stocks.map(async (stock) => {
          const info = await getStockInfo(stock);
          return {
            label: info ? `${info.name}(${info.code})` : stock,
            description: "点击移除",
            stock: stock,
          };
        })
      );

      const selected = await vscode.window.showQuickPick(stockOptions, {
        placeHolder: "选择要移除的股票",
      });

      if (selected) {
        const removedStock = selected.stock;
        stocks = stocks.filter((s) => s !== removedStock);
        await config.update(
          "stocks",
          stocks,
          vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(`已移除: ${selected.label}`);
        updateStockInfo();
      }
    }
  );

  const clearStocksCommand = vscode.commands.registerCommand(
    "watch-stock.clearStocks",
    async () => {
      if (stocks.length > 0) {
        const confirm = await vscode.window.showWarningMessage(
          "确定要清空所有股票吗？",
          "确定",
          "取消"
        );
        if (confirm === "确定") {
          stocks = [];
          await config.update(
            "stocks",
            stocks,
            vscode.ConfigurationTarget.Global
          );
          updateStockInfo();
        }
      }
    }
  );

  const manageStockCommand = vscode.commands.registerCommand(
    "watch-stock.manageStock",
    async () => {
      const options = [
        {
          label: "$(add) 添加股票",
          description: "输入股票代码或名称添加新股票",
          action: "add",
        },
        {
          label: "$(remove) 移除股票",
          description: "从已添加的股票中选择移除",
          action: "remove",
        },
      ];

      // 如果已有股票，添加更多选项
      if (stocks.length > 0) {
        options.push(
          {
            label: "$(list-flat) 查看股票",
            description: "查看已添加的所有股票",
            action: "view",
          },
          {
            label: "$(trash) 清空股票",
            description: "清空所有已添加的股票",
            action: "clear",
          }
        );
      }
      // 其他操作
      options.push(
        {
          label: isVisible ? "$(eye-closed) 隐藏状态栏" : "$(eye) 显示状态栏",
          description: isVisible
            ? "隐藏状态栏股票信息显示"
            : "显示状态栏股票信息",
          action: "toggle",
        },
        {
          label: "$(refresh) 刷新股票数据",
          description: "立即刷新股票数据",
          action: "refresh",
        }
      );

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder:
          stocks.length > 0 ? "选择操作" : "还没有添加股票，请选择操作",
      });

      if (!selected) return;

      switch (selected.action) {
        case "add":
          await vscode.commands.executeCommand("watch-stock.addStock");
          break;
        case "remove":
          await vscode.commands.executeCommand("watch-stock.removeStock");
          break;
        case "view":
          if (stocks.length > 0) {
            const stockDetails = await Promise.all(
              stocks.map(async (stock) => {
                const info = await getStockInfo(stock);
                return info ? `${info.name}(${info.code})` : stock;
              })
            );
            vscode.window.showInformationMessage(
              `已添加的股票：${stockDetails.join(", ")}`
            );
          }
          break;
        case "clear":
          await vscode.commands.executeCommand("watch-stock.clearStocks");
          break;
        case "toggle":
          await vscode.commands.executeCommand("watch-stock.toggleVisibility");
          break;
        case "refresh":
          await vscode.commands.executeCommand("watch-stock.refreshData");
          break;
      }
    }
  );

  // 设置状态栏点击命令为管理股票
  statusBarItem.command = "watch-stock.manageStock";

  // 注册切换显示/隐藏命令
  const toggleVisibilityCommand = vscode.commands.registerCommand(
    "watch-stock.toggleVisibility",
    () => {
      isVisible = !isVisible;
      if (isVisible) {
        updateStockInfo();
      } else {
        statusBarItem.text = "$(eye-closed)";
        statusBarItem.tooltip = "状态栏股票信息已隐藏\n点击后选择‘显示状态栏’";
      }
    }
  );

  // 注册刷新数据命令
  const refreshDataCommand = vscode.commands.registerCommand(
    "watch-stock.refreshData",
    async () => {
      if (!isVisible) {
        vscode.window.showWarningMessage(
          "股票信息已隐藏，请先显示股票信息后再刷新"
        );
        return;
      }

      if (stocks.length === 0) {
        vscode.window.showInformationMessage("当前没有添加任何股票");
        return;
      }

      await updateStockInfo();
      vscode.window.showInformationMessage("股票数据刷新完成");
    }
  );

  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(addStockCommand);
  context.subscriptions.push(removeStockCommand);
  context.subscriptions.push(clearStocksCommand);
  context.subscriptions.push(manageStockCommand);
  context.subscriptions.push(toggleVisibilityCommand);
  context.subscriptions.push(refreshDataCommand);

  // 开始定时更新
  startRefreshTimer();
  updateStockInfo();
}

/**
 * 获取股票信息
 *
 * 支持多种输入格式：
 * - 股票代码：600519、000001
 * - 带前缀代码：sh600519、sz000001
 * - 中文名称：贵州茅台、中国平安
 *
 * @param {string} input - 股票代码或名称
 * @returns {Promise<Object|null>} 股票信息对象或null
 */
async function getStockInfo(input) {
  try {
    let code = input;
    let market = "sh";

    // 1. 解析输入格式
    if (input.match(/^(sh|sz|bj)[0-9]{4,6}$/i)) {
      // 带市场前缀的完整代码，如 sh600519, sz000001
      const match = input.match(/^(sh|sz|bj)([0-9]{4,6})$/i);
      market = match[1].toLowerCase();
      code = match[2].padStart(6, "0"); // 补齐6位
    } else if (input.match(/^[0-9]{6}$/)) {
      // 纯数字代码，默认上交所
      code = input;
      market = "sh";
    } else {
      // 中文名称搜索
      try {
        // 方法1：使用新浪搜索API
        const searchResponse = await axios.get(
          `https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15,21,22,23,24,25,31,32,33,34,35&key=${encodeURIComponent(
            input
          )}`,
          {
            timeout: 5000,
            responseType: "arraybuffer",
            headers: {
              Referer: "https://finance.sina.com.cn",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          }
        );

        const searchData = iconv.decode(
          Buffer.from(searchResponse.data),
          "gbk"
        );

        // 解析搜索结果
        const match = searchData.match(/var suggestvalue="([^"]+)"/);
        if (match && match[1]) {
          const items = match[1].split(";");
          // 过滤掉空项，寻找第一个有效的股票
          const validItems = items.filter((item) => item && item.trim());

          for (const item of validItems) {
            const stockInfo = item.split(",");
            if (stockInfo.length >= 4) {
              const stockCode = stockInfo[2];
              const fullCode = stockInfo[3];

              // 确保是A股股票（过滤掉港股、美股等）
              if (
                fullCode &&
                (fullCode.startsWith("sh") || fullCode.startsWith("sz")) &&
                stockCode &&
                stockCode.match(/^[0-9]{6}$/)
              ) {
                code = stockCode;
                market = fullCode.startsWith("sh") ? "sh" : "sz";
                break; // 找到第一个匹配的A股股票
              }
            }
          }
        }
      } catch (searchError) {
        console.error("新浪搜索失败:", searchError.message);
      }

      // 如果新浪搜索失败，尝试备用方案
      if (!code) {
        // 方法2：使用腾讯股票搜索API作为备选
        try {
          const tencentResponse = await axios.get(
            `https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(
              input
            )}&t=all`,
            {
              timeout: 5000,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              },
            }
          );

          const tencentData = tencentResponse.data;

          // 腾讯API返回格式：v_hint="中国平安,sh601318,中国平安保险(集团)股份有限公司"
          const tencentMatch = tencentData.match(/v_hint="([^"]+)"/);
          if (tencentMatch && tencentMatch[1]) {
            const parts = tencentMatch[1].split(",");
            if (parts.length >= 2) {
              const fullCode = parts[1];
              if (fullCode.match(/^(sh|sz)[0-9]{6}$/)) {
                market = fullCode.substring(0, 2);
                code = fullCode.substring(2);
              }
            }
          }
        } catch (tencentError) {
          console.error("腾讯搜索失败:", tencentError.message);
        }
      }

      // 如果新浪和腾讯API都失败
      if (!code) {
        // 提供更友好的错误提示
        let errorMessage = `股票获取失败："${input}"\n\n`;
        errorMessage += "可能的原因：\n";
        errorMessage += "• 股票名称或代码输入错误\n";
        errorMessage += "• 该股票不存在或已退市\n";
        errorMessage += "• 网络连接问题\n\n";
        errorMessage += "请尝试：\n";
        errorMessage += "• 使用股票代码（如：sh601318）\n";
        errorMessage += "• 检查股票名称拼写\n";
        errorMessage += "• 稍后重试";

        vscode.window.showErrorMessage(errorMessage);
        return null;
      }
    }

    // 2. 获取股票实时数据
    const response = await axios.get(
      `https://hq.sinajs.cn/list=${market}${code}`,
      {
        timeout: 3000,
        responseType: "arraybuffer",
        headers: {
          Referer: "https://finance.sina.com.cn",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );

    // 解析返回数据
    const data = iconv.decode(Buffer.from(response.data), "gbk");
    const match = data.match(/var hq_str_[^"]+="([^"]+)"/);
    if (!match || !match[1]) {
      return null;
    }

    const parts = match[1].split(",");
    if (parts.length < 4) {
      return null;
    }

    // 3. 解析股票数据
    // 数据格式：名称,今日开盘价,昨日收盘价,当前价,今日最高价,今日最低价,...
    const name = parts[0];
    const current = parseFloat(parts[3]);
    const close = parseFloat(parts[2]);

    // 数据验证
    if (!name || isNaN(current) || isNaN(close) || close <= 0) {
      return null;
    }

    // 计算涨跌信息
    const change = current - close;
    const changePercent = ((change / close) * 100).toFixed(2);

    // 判断是否为ETF - ETF通常价格较低且名称包含ETF字样
    const isETF =
      name.includes("ETF") ||
      (current < 5 && (name.includes("基金") || name.includes("指数")));
    const priceDecimalPlaces = isETF ? 3 : 2;

    return {
      name: name.trim(),
      code: code,
      current: current.toFixed(priceDecimalPlaces),
      change: change.toFixed(priceDecimalPlaces),
      changePercent,
      isUp: change >= 0,
      market: market,
      isETF: isETF,
    };
  } catch (error) {
    console.error("获取股票数据失败:", error.message);
  }
  return null;
}

/**
 * 更新状态栏显示
 * 获取股票数据并更新状态栏文本和提示信息
 */
async function updateStockInfo() {
  // 如果处于隐藏状态，不更新股票信息
  if (!isVisible) {
    return;
  }

  const config = vscode.workspace.getConfiguration("watch-stock");
  const maxDisplayCount = config.get("maxDisplayCount", 5);
  const showTwoLetterCode = config.get("showTwoLetterCode", false);

  // 无股票时的提示
  if (stocks.length === 0) {
    statusBarItem.text = "$(add) 点击添加股票";
    statusBarItem.tooltip = "点击管理股票，开始您的看盘之旅";
    return;
  }

  // 获取所有股票信息
  const allStockInfos = await Promise.all(
    stocks.map((stock) => getStockInfo(stock))
  );

  // 过滤有效数据
  const validStocks = allStockInfos.filter((info) => info !== null);

  // 状态栏显示前maxDisplayCount个股票
  const displayStocks = validStocks.slice(0, maxDisplayCount);

  // 无有效数据时的处理
  if (displayStocks.length === 0) {
    statusBarItem.text = "$(error) 股票获取失败";
    statusBarItem.tooltip = "请检查网络连接或股票代码是否正确";
    return;
  }

  // 构建状态栏文本
  const stockTexts = displayStocks.map((stock) => {
    const symbol = stock.isUp ? "↗" : "↘";
    const displayName =
      showTwoLetterCode && stock.name.length > 2
        ? stock.name.substring(0, 2)
        : stock.name;
    return `${displayName} ${stock.current} ${symbol}${stock.changePercent}%`;
  });

  // 处理超出显示限制的情况
  const text = stockTexts.join(" | ");
  const finalText =
    validStocks.length > maxDisplayCount
      ? `${text} ...(${validStocks.length - maxDisplayCount}+)`
      : text;

  statusBarItem.text = finalText;

  // 构建悬停提示
  let tooltip = validStocks
    .map(
      (stock) =>
        `${stock.name}(${stock.code}): ${stock.current} ${
          stock.change >= 0 ? "+" : ""
        }${stock.change}(${stock.changePercent}%)`
    )
    .join("\n");

  // 添加获取失败提示（如果有）
  if (stocks.length > validStocks.length) {
    const failedCount = stocks.length - validStocks.length;
    tooltip += `\n\n$(warning) ${failedCount}只股票获取失败`;
  }

  statusBarItem.tooltip = tooltip;
}

/**
 * 启动定时刷新
 * 根据配置设置刷新间隔，只在交易时间内刷新
 */
function startRefreshTimer() {
  const config = vscode.workspace.getConfiguration("watch-stock");
  const interval = config.get("refreshInterval", 5000);

  // 清除现有定时器
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  // 设置新的定时器，只在交易时间内刷新
  refreshInterval = setInterval(() => {
    if (isTradingTime()) {
      updateStockInfo();
    } else {
      console.log("当前非交易时间，跳过刷新");
    }
  }, interval);
}

/**
 * 插件停用函数
 * 清理资源，停止定时器
 */
function deactivate() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// 导出插件接口
module.exports = {
  activate,
  deactivate,
};

/**
 * 判断当前是否为A股交易时间
 * 交易时间：工作日 9:15-11:30 和 13:00-15:00
 * @returns {boolean} 是否在交易时间内
 */
function isTradingTime() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // 周末不交易
  if (day === 0 || day === 6) {
    return false;
  }

  // 转换为分钟数便于比较
  const currentMinutes = hour * 60 + minute;

  // 上午交易时段：9:15-11:30
  const morningStart = 9 * 60 + 15;
  const morningEnd = 11 * 60 + 30;

  // 下午交易时段：13:00-15:00
  const afternoonStart = 13 * 60;
  const afternoonEnd = 15 * 60;

  return (
    (currentMinutes >= morningStart && currentMinutes <= morningEnd) ||
    (currentMinutes >= afternoonStart && currentMinutes <= afternoonEnd)
  );
}
