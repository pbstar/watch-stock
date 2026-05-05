// 股票数据服务，支持新浪/腾讯双源批量查询
import { get, getGbk } from "../utils/http";
import { buildTimeSlots } from "../utils/time";
import { isFund, getDecimals, safeNumber } from "../utils/stock";
import type { Stock, StockQuote, MinutePoint } from "../types";

// 解析新浪源单条数据
function parseSinaStockData(code: string, data: string): Stock | null {
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
  const dec = getDecimals(isETF);

  return {
    name,
    code,
    current: current.toFixed(dec),
    changeValue: changeValue.toFixed(dec),
    changePercent,
    amount,
    isETF,
    dateTime: `${parts[30]} ${parts[31]}`,
    close,
    buy1Volume: Math.round(parseFloat(parts[10]) / 100) || 0,
    sell1Volume: Math.round(parseFloat(parts[20]) / 100) || 0,
    buy1Price: parseFloat(parts[6]) || 0,
    sell1Price: parseFloat(parts[7]) || 0,
  };
}

// 腾讯源完整行情解析（含市值、PE、PB 等详细指标）
function parseFullQuote(fields: string[], code: string): StockQuote {
  const isETF = isFund(code, fields[1] ?? "", safeNumber(fields[3]));
  const dec = getDecimals(isETF);

  // 20260409114906 -> 2026-04-09 11:49
  const r = fields[30] ?? "";
  const dateTime =
    r.length === 14
      ? `${r.slice(0, 4)}-${r.slice(4, 6)}-${r.slice(6, 8)} ${r.slice(8, 10)}:${r.slice(10, 12)}`
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

// 腾讯源简版行情解析（无封单/时间字段）
function parseSimpleQuote(fields: string[], code: string): Stock {
  const isETF = isFund(code, fields[1] ?? "", safeNumber(fields[3]));
  const dec = getDecimals(isETF);

  return {
    name: fields[1] ?? "",
    code,
    current: safeNumber(fields[3]).toFixed(dec),
    changeValue: safeNumber(fields[4]).toFixed(dec),
    changePercent: safeNumber(fields[5]).toFixed(2),
    amount: safeNumber(fields[7]),
    isETF,
    dateTime: "",
  };
}

// 通用腾讯响应分行解析
function parseTencentLines<T>(
  text: string,
  codes: string[],
  parser: (fields: string[], code: string) => T,
): T[] {
  return text
    .split(";")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, index) => {
      const eqIdx = line.indexOf("=");
      if (eqIdx < 0) return null;
      let raw = line.slice(eqIdx + 1).trim();
      if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
      const code = codes[index];
      if (!code) return null;
      return parser(raw.split("~"), code);
    })
    .filter((v): v is T => v !== null);
}

// 批量获取股票行情（默认新浪源，集合竞价期间切换腾讯简版源）
export async function getStockList(
  codes: string[],
  isSina = true,
): Promise<Stock[]> {
  if (!codes?.length) return [];

  try {
    if (isSina) {
      const url = `https://hq.sinajs.cn/list=${codes.join(",")}`;
      const data = await getGbk(url);
      return data
        .split("\n")
        .map((line) => {
          const m = line.match(/var hq_str_([^=]+)="([^"]+)"/);
          if (m?.[1] && m[2] && codes.includes(m[1].toLowerCase())) {
            return parseSinaStockData(m[1].toLowerCase(), m[2]);
          }
          return null;
        })
        .filter((v): v is Stock => v !== null);
    }

    const url = `https://qt.gtimg.cn/?q=${codes.map((c) => `s_${c}`).join(",")}`;
    const data = await getGbk(url);
    return parseTencentLines(data, codes, parseSimpleQuote);
  } catch {
    return [];
  }
}

// 详细行情列表
export async function getStockQuoteList(
  codes: string[],
): Promise<StockQuote[]> {
  if (!codes?.length) return [];
  try {
    const url = `https://qt.gtimg.cn/?q=${codes.join(",")}`;
    const res = await getGbk(url);
    if (!res) return [];
    return parseTencentLines(res, codes, parseFullQuote);
  } catch {
    return [];
  }
}

// 分时数据（按完整时间槽填充，无数据点占位 null）
export async function getStockMinute(code: string): Promise<MinutePoint[]> {
  try {
    const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`;
    const text = await get(url);
    const res = JSON.parse(text);
    const stockData = res?.data?.[code];
    const d: string | undefined = stockData?.data?.date;
    if (!d) return [];

    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const slots = buildTimeSlots(date);

    const dataMap = new Map<string, MinutePoint>();
    const list: string[] = stockData?.data?.data ?? [];
    for (const itemStr of list) {
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

    return slots.map(
      (time) =>
        dataMap.get(time) ?? { time, price: null, volume: null, amount: null },
    );
  } catch {
    return [];
  }
}
