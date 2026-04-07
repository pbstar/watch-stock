/**
 * 股票数据服务
 * 获取股票实时数据，支持批量查询
 */

const { get, getGbk } = require("../utils/httpClient");

/**
 * 批量获取股票信息
 * @param {string[]} codes - 股票代码数组，如 ['sh600519', 'sz000001']
 * @returns {Promise<Array>} 股票信息数组
 */
async function getStockList(codes) {
  if (!codes?.length) return [];

  try {
    const url = `https://hq.sinajs.cn/list=${codes.join(",")}`;
    const data = await getGbk(url);
    const results = data
      .split("\n")
      .map((line) => {
        const match = line.match(/var hq_str_([^=]+)="([^"]+)"/);
        if (match?.[1] && match[2] && codes.includes(match[1].toLowerCase())) {
          return parseStockData(match[1].toLowerCase(), match[2]);
        }
        return null;
      })
      .filter(Boolean);

    return results;
  } catch (error) {
    const errorMsg = `获取股票数据失败: ${error.message}`;
    console.error(errorMsg);
    return [];
  }
}

/**
 * 解析股票数据
 * @param {string} code - 股票代码
 * @param {string} data - 原始数据字符串
 * @returns {Object|null} 解析后的股票信息
 */
function parseStockData(code, data) {
  const parts = data.split(",");
  if (parts.length < 32) return null;
  const name = parts[0]?.trim() || "";
  const close = parseFloat(parts[2]) || 0;
  const current = parseFloat(parts[3]) || 0;
  const amount = parseFloat(parts[9]) || 0;

  // 数据验证
  if (
    !name ||
    close <= 0 ||
    current <= 0 ||
    amount <= 0 ||
    !parts[30] ||
    !parts[31]
  ) {
    return null;
  }

  // 计算涨跌和百分比
  const changeValue = current - close;
  const changePercent = ((changeValue / close) * 100).toFixed(2);

  // 判断是否为基金/ETF
  const codeNum = code.substring(2);
  const isFundByCode =
    (code.startsWith("sh") && codeNum.startsWith("5")) ||
    (code.startsWith("sz") && codeNum.startsWith("1"));
  const isETF =
    isFundByCode ||
    name.includes("ETF") ||
    name.includes("LOF") ||
    (current < 3 && (name.includes("基金") || name.includes("指数")));
  const decimals = isETF ? 3 : 2;
  const dateTime = `${parts[30]} ${parts[31]}`;

  return {
    name,
    code,
    preClose: close.toFixed(decimals),
    current: current.toFixed(decimals),
    changeValue: changeValue.toFixed(decimals),
    changePercent,
    amount,
    market: code.substring(0, 2),
    isETF,
    dateTime,
  };
}

/**
 * 生成 A 股交易时间槽（09:30-11:30 和 13:00-15:00，共 242 个）
 * @param {string} date - 日期字符串 YYYY-MM-DD
 * @returns {string[]} 完整时间槽数组
 */
function buildTimeSlots(date) {
  const slots = [];
  // 上午 09:30-11:30
  for (let t = 9 * 60 + 30; t <= 11 * 60 + 30; t++) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    slots.push(
      `${date} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    );
  }
  // 下午 13:00-15:00
  for (let t = 13 * 60; t <= 15 * 60; t++) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    slots.push(
      `${date} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    );
  }
  return slots;
}

/**
 * 获取股票分时数据
 * @param {string} code - 股票代码，如 sh600519
 * @returns {Promise<Array>} 分时数据数组（含 null 占位，共 242 个时间槽）
 */
async function getStockMinute(code) {
  try {
    const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`;
    const text = await get(url);
    const res = JSON.parse(text);
    const stockData = res?.data?.[code];
    const d = stockData?.data?.date;
    if (!d) return [];

    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const slots = buildTimeSlots(date);

    // 构建已有数据的时间映射
    const dataMap = new Map();
    if (stockData?.data?.data?.length) {
      for (const itemStr of stockData.data.data) {
        const item = itemStr.split(" ");
        if (item.length !== 4 || !item[0]) continue;
        const time = `${date} ${item[0].slice(0, 2)}:${item[0].slice(2, 4)}`;
        dataMap.set(time, {
          time,
          price: parseFloat(item[1]) || 0,
          volume: parseFloat(item[2]) || 0,
          amount: parseFloat(item[3]) || 0,
        });
      }
    }

    // 按完整时间槽填充，无数据点用 null 占位
    return slots.map(
      (time) =>
        dataMap.get(time) ?? { time, price: null, volume: null, amount: null },
    );
  } catch (error) {
    console.error(`获取分时数据失败: ${error.message}`);
    return [];
  }
}

/**
 * 安全转换为数字
 * @param {string} val - 原始值
 * @returns {number} 数字
 */
function safeNumber(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

/**
 * 解析完整行情数据
 * @param {string[]} fields - 字段数组
 * @returns {Object} 解析后的股票信息
 */
function parseFullQuote(fields, code) {
  return {
    name: fields[1] ?? "",
    code: code,
    price: safeNumber(fields[3]),
    close: safeNumber(fields[4]),
    open: safeNumber(fields[5]),
    volume: safeNumber(fields[6]),
    changePercent: safeNumber(fields[32]),
    high: safeNumber(fields[33]),
    low: safeNumber(fields[34]),
    amount: safeNumber(fields[37]) * 10000,
    turnoverRatio: safeNumber(fields[38]),
    pe: safeNumber(fields[39]),
    circulationMarket: safeNumber(fields[44]) * 100000000,
    totalMarket: safeNumber(fields[45]) * 100000000,
    pb: safeNumber(fields[46]),
    volumeRatio: safeNumber(fields[49]),
    avgPrice: safeNumber(fields[51]),
    circulatingShares: safeNumber(fields[72]),
    totalShares: safeNumber(fields[73]),
  };
}

/**
 * 解析腾讯行情响应
 * @param {string} text - 响应文本
 * @returns {Array} 股票信息数组
 */
function parseQuoteResponse(text, codes) {
  const lines = text
    .split(";")
    .map((l) => l.trim())
    .filter(Boolean);
  const results = [];
  for (const [index, line] of lines.entries()) {
    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;
    let key = line.slice(0, eqIdx).trim();
    if (key.startsWith("v_")) key = key.slice(2);
    let raw = line.slice(eqIdx + 1).trim();
    if (raw.startsWith('"') && raw.endsWith('"')) {
      raw = raw.slice(1, -1);
    }
    const fields = raw.split("~");
    results.push(parseFullQuote(fields, codes[index]));
  }
  return results;
}

/**
 * 获取股票详细行情列表
 * @param {string[]} codes - 股票代码数组，如 ['sh600519', 'sz000001']
 * @returns {Promise<Array>} 股票详细信息数组
 */
async function getStockQuoteList(codes) {
  if (!codes?.length) return [];

  try {
    const url = `https://qt.gtimg.cn/?q=${codes.join(",")}`;
    const res = await getGbk(url);
    if (!res) return [];
    const data = parseQuoteResponse(res, codes);
    return data;
  } catch (error) {
    console.error(`获取股票详细行情失败: ${error.message}`);
    return [];
  }
}

module.exports = {
  getStockList,
  getStockMinute,
  getStockQuoteList,
};
