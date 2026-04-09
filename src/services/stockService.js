/**
 * 股票数据服务
 * 获取股票实时数据，支持批量查询
 */

const { get, getGbk } = require("../utils/httpClient");
const { buildTimeSlots } = require("../utils/tradingTime");

/**
 * 判断是否为基金/ETF
 * @param {string} code - 股票代码（小写，如 sh600519）
 * @param {string} name - 股票名称
 * @param {number} current - 当前价格
 * @returns {boolean}
 */
function isFund(code, name, current) {
  const codeNum = code.substring(2);
  const isFundByCode =
    (code.startsWith("sh") && codeNum.startsWith("5")) ||
    (code.startsWith("sz") && codeNum.startsWith("1"));
  return (
    isFundByCode ||
    (name && (name.includes("ETF") || name.includes("LOF"))) ||
    (current > 0 &&
      current < 3 &&
      name &&
      (name.includes("基金") || name.includes("指数")))
  );
}

/**
 * 获取价格精度小数位数
 * @param {boolean} isETF - 是否为基金
 * @returns {number}
 */
function getDecimals(isETF) {
  return isETF ? 3 : 2;
}

/**
 * 安全转换为数字
 * @param {string} val - 原始值
 * @returns {number}
 */
function safeNumber(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

/**
 * 批量获取股票信息
 * @param {string[]} codes - 股票代码数组，如 ['sh600519', 'sz000001']
 * @param {boolean} isSina - 是否使用新浪源（默认 true）
 * @returns {Promise<Array>} 股票信息数组
 */
async function getStockList(codes, isSina = true) {
  if (!codes?.length) return [];

  try {
    if (isSina) {
      const url = `https://hq.sinajs.cn/list=${codes.join(",")}`;
      const data = await getGbk(url);
      return data
        .split("\n")
        .map((line) => {
          const match = line.match(/var hq_str_([^=]+)="([^"]+)"/);
          if (
            match?.[1] &&
            match[2] &&
            codes.includes(match[1].toLowerCase())
          ) {
            return parseSinaStockData(match[1].toLowerCase(), match[2]);
          }
          return null;
        })
        .filter(Boolean);
    }

    const url = `https://qt.gtimg.cn/?q=${codes.map((code) => `s_${code}`).join(",")}`;
    const data = await getGbk(url);
    return parseTencentResponse(data, codes, true);
  } catch (error) {
    console.error(`获取股票数据失败: ${error.message}`);
    return [];
  }
}

/**
 * 解析新浪股票数据
 * @param {string} code - 股票代码
 * @param {string} data - 原始数据字符串
 * @returns {Object|null} 解析后的股票信息
 */
function parseSinaStockData(code, data) {
  const parts = data.split(",");
  if (parts.length < 32) return null;

  const name = parts[0]?.trim() || "";
  const close = parseFloat(parts[2]) || 0;
  let current = parseFloat(parts[3]) || 0;
  const amount = parseFloat(parts[9]) || 0;

  if (!name || close <= 0 || !parts[30] || !parts[31]) return null;

  // 开盘前当前价为0，使用昨收价
  if (current <= 0) current = close;

  const changeValue = current - close;
  const changePercent = ((changeValue / close) * 100).toFixed(2);
  const isETF = isFund(code, name, current);

  return {
    name,
    code,
    current: current.toFixed(getDecimals(isETF)),
    changeValue: changeValue.toFixed(getDecimals(isETF)),
    changePercent,
    amount,
    isETF,
    dateTime: `${parts[30]} ${parts[31]}`,
  };
}

/**
 * 解析完整行情数据（腾讯源）
 * @param {string[]} fields - 字段数组
 * @param {string} code - 股票代码
 * @returns {Object} 解析后的股票信息
 */
function parseFullQuote(fields, code) {
  const isETF = isFund(code, fields[1], safeNumber(fields[3]));
  const dec = getDecimals(isETF);

  // 20260409114906 -> 2026-04-09 11:49
  const raw = fields[30] ?? "";
  const dateTime =
    raw.length === 14
      ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)} ${raw.slice(8, 10)}:${raw.slice(10, 12)}`
      : "";

  return {
    name: fields[1] ?? "",
    code,
    current: safeNumber(fields[3]).toFixed(dec),
    close: safeNumber(fields[4]).toFixed(dec),
    open: safeNumber(fields[5]).toFixed(dec),
    volume: safeNumber(fields[6]),
    changeValue: safeNumber(fields[31]).toFixed(dec),
    changePercent: safeNumber(fields[32]).toFixed(2),
    high: safeNumber(fields[33]).toFixed(dec),
    low: safeNumber(fields[34]).toFixed(dec),
    amount: safeNumber(fields[37]) * 10000,
    turnoverRatio: safeNumber(fields[38]).toFixed(2),
    pe: safeNumber(fields[39]),
    circulationMarket: safeNumber(fields[44]) * 100000000,
    totalMarket: safeNumber(fields[45]) * 100000000,
    pb: safeNumber(fields[46]),
    volumeRatio: safeNumber(fields[49]).toFixed(2),
    avgPrice: safeNumber(fields[51]).toFixed(dec),
    circulatingShares: safeNumber(fields[72]),
    totalShares: safeNumber(fields[73]),
    isETF,
    dateTime,
  };
}

/**
 * 解析简单行情数据（腾讯源）
 * @param {string[]} fields - 字段数组
 * @param {string} code - 股票代码
 * @returns {Object} 解析后的股票信息
 */
function parseSimpleQuote(fields, code) {
  const isETF = isFund(code, fields[1], safeNumber(fields[3]));
  const dec = getDecimals(isETF);

  return {
    name: fields[1],
    code,
    current: safeNumber(fields[3]).toFixed(dec),
    changeValue: safeNumber(fields[4]).toFixed(dec),
    changePercent: safeNumber(fields[5]).toFixed(2),
    amount: safeNumber(fields[7]),
    isETF,
    dateTime: "",
  };
}

/**
 * 解析腾讯行情响应
 * @param {string} text - 响应文本
 * @param {string[]} codes - 股票代码数组
 * @param {boolean} isSimple - 是否使用简版解析
 * @returns {Array} 股票信息数组
 */
function parseTencentResponse(text, codes, isSimple = false) {
  const lines = text
    .split(";")
    .map((l) => l.trim())
    .filter(Boolean);

  return lines
    .map((line, index) => {
      const eqIdx = line.indexOf("=");
      if (eqIdx < 0) return null;

      let key = line.slice(0, eqIdx).trim();
      if (key.startsWith("v_")) key = key.slice(2);

      let raw = line.slice(eqIdx + 1).trim();
      if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);

      const fields = raw.split("~");
      const code = codes[index];
      return isSimple
        ? parseSimpleQuote(fields, code)
        : parseFullQuote(fields, code);
    })
    .filter(Boolean);
}

/**
 * 获取股票详细行情列表
 * @param {string[]} codes - 股票代码数组
 * @returns {Promise<Array>} 股票详细信息数组
 */
async function getStockQuoteList(codes) {
  if (!codes?.length) return [];

  try {
    const url = `https://qt.gtimg.cn/?q=${codes.join(",")}`;
    const res = await getGbk(url);
    if (!res) return [];
    return parseTencentResponse(res, codes);
  } catch (error) {
    console.error(`获取股票详细行情失败: ${error.message}`);
    return [];
  }
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

module.exports = {
  getStockList,
  getStockMinute,
  getStockQuoteList,
};
