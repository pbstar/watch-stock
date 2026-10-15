// 腾讯数据源：简版行情、完整行情、分时（只负责取数与解析，不含缓存）
import { get, getGbk } from "../utils/http";
import { buildTimeSlots } from "../utils/time";
import { isFund, safeNumber } from "../utils/stock";
import { decOf } from "../shared/format";
import type { MinutePoint, Stock, StockQuote } from "../types";

// 通用腾讯响应分行解析：按变量名中的代码匹配（v_s_sh600519 / v_sh600519），
// 避免返回行数与请求数不一致时按下标对齐导致数据错位
function parseLines<T>(
  text: string,
  codes: string[],
  parser: (fields: string[], code: string) => T | null,
): T[] {
  const codeSet = new Set(codes.map((c) => c.toLowerCase()));
  return text
    .split(";")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const eqIdx = line.indexOf("=");
      if (eqIdx < 0) return null;
      const code = line
        .slice(0, eqIdx)
        .trim()
        .replace(/^v_(s_)?/i, "")
        .toLowerCase();
      let raw = line.slice(eqIdx + 1).trim();
      if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
      if (!code || !raw || !codeSet.has(code)) return null;
      return parser(raw.split("~"), code);
    })
    .filter((v): v is T => v !== null);
}

// 简版行情解析（无封单/时间字段），无效行返回 null
function parseSimple(fields: string[], code: string): Stock | null {
  const name = fields[1] ?? "";
  if (!name) return null;
  const isETF = isFund(code, name, safeNumber(fields[3]));
  const dec = decOf(isETF);

  return {
    name,
    code,
    current: safeNumber(fields[3]).toFixed(dec),
    changeValue: safeNumber(fields[4]).toFixed(dec),
    changePercent: safeNumber(fields[5]).toFixed(2),
    amount: safeNumber(fields[7]),
    isETF,
    dateTime: "",
  };
}

// 完整行情解析（含成交额、换手、市值、PE 等详细指标），无效行返回 null
function parseFull(fields: string[], code: string): StockQuote | null {
  const name = fields[1] ?? "";
  // 名称为空视为无效行（如接口对无效代码返回的空数据）
  if (!name) return null;
  const isETF = isFund(code, name, safeNumber(fields[3]));
  const dec = decOf(isETF);

  // 20260409114906 -> 2026-04-09 11:49
  const r = fields[30] ?? "";
  const dateTime =
    r.length === 14
      ? `${r.slice(0, 4)}-${r.slice(4, 6)}-${r.slice(6, 8)} ${r.slice(8, 10)}:${r.slice(10, 12)}`
      : "";

  return {
    name,
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
    totalMarket: safeNumber(fields[45]) * 100000000,
    volumeRatio: safeNumber(fields[49]).toFixed(2),
    isETF,
    dateTime,
  };
}

// 简版批量行情，集合竞价等新浪缺数据时段兜底
export async function fetchSimpleQuotes(codes: string[]): Promise<Stock[]> {
  const url = `https://qt.gtimg.cn/?q=${codes.map((c) => `s_${c}`).join(",")}`;
  return parseLines(await getGbk(url), codes, parseSimple);
}

// 完整批量行情
export async function fetchFullQuotes(codes: string[]): Promise<StockQuote[]> {
  const url = `https://qt.gtimg.cn/?q=${codes.join(",")}`;
  return parseLines(await getGbk(url), codes, parseFull);
}

// 分时数据（按完整时间槽填充，无数据点占位 null）
export async function fetchMinute(code: string): Promise<MinutePoint[]> {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${code}`;
  const res = JSON.parse(await get(url));
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
      price: safeNumber(item[1]),
      volume: safeNumber(item[2]),
    });
  }

  return slots.map(
    (time) => dataMap.get(time) ?? { time, price: null, volume: null },
  );
}
