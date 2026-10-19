// 新浪数据源：批量行情、涨跌榜、资金榜、股票搜索（只负责取数与解析，不含缓存）
import { get, getGbk } from "../utils/http";
import { isFund, safeNumber } from "../utils/stock";
import { decOf } from "../shared/format";
import type { MoneyFlowItem, RankItem, Stock } from "../types";

// 解析单条行情（含五档封单），无效行返回 null
function parseQuote(code: string, data: string): Stock | null {
  const parts = data.split(",");
  if (parts.length < 32) return null;

  const name = parts[0]?.trim() || "";
  const close = safeNumber(parts[2]);
  let current = safeNumber(parts[3]);
  const amount = safeNumber(parts[9]);

  if (!name || close <= 0 || !parts[30] || !parts[31]) return null;

  // 开盘前当前价为0，使用昨收价
  if (current <= 0) current = close;

  const changeValue = current - close;
  const changePercent = ((changeValue / close) * 100).toFixed(2);
  const isETF = isFund(code, name, current);
  const dec = decOf(isETF);

  return {
    name,
    code,
    current: current.toFixed(dec),
    changeValue: changeValue.toFixed(dec),
    changePercent,
    amount,
    isETF,
    dateTime: `${parts[30]} ${parts[31]}`,
    buy1Volume: Math.round(safeNumber(parts[10]) / 100),
    sell1Volume: Math.round(safeNumber(parts[20]) / 100),
    buy1Price: safeNumber(parts[6]),
    sell1Price: safeNumber(parts[7]),
  };
}

// 批量行情（codes 需为小写标准代码，与接口返回的变量名一致）
export async function fetchQuote(codes: string[]): Promise<Stock[]> {
  const url = `https://hq.sinajs.cn/list=${codes.join(",")}`;
  const text = await getGbk(url);
  const codeSet = new Set(codes);
  return text
    .split("\n")
    .map((line) => {
      const m = line.match(/var hq_str_([^=]+)="([^"]+)"/);
      const code = m?.[1]?.toLowerCase();
      if (code && m?.[2] && codeSet.has(code)) {
        return parseQuote(code, m[2]);
      }
      return null;
    })
    .filter((v): v is Stock => v !== null);
}

// 新浪行情中心原始字段（Simple 版，数值均为字符串）
interface RankRaw {
  symbol?: string;
  name?: string;
  trade?: string;
  pricechange?: string;
  changepercent?: string;
}

// 涨跌排行：沪深京 A 股全市场按涨跌幅取头部，asc=false 涨幅榜、true 跌幅榜
export async function fetchRank(asc: boolean, num: number): Promise<RankItem[]> {
  const url =
    "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php" +
    "/Market_Center.getHQNodeDataSimple" +
    `?page=1&num=${num}&sort=changepercent&asc=${asc ? 1 : 0}&node=hs_a&symbol=`;
  const list: RankRaw[] = JSON.parse(await get(url));
  if (!Array.isArray(list)) return [];
  return list
    .filter((d) => d?.symbol && d?.name)
    .map((d) => ({
      code: String(d.symbol).toLowerCase(),
      name: String(d.name),
      current: safeNumber(d.trade).toFixed(2),
      changeValue: safeNumber(d.pricechange).toFixed(2),
      changePercent: safeNumber(d.changepercent).toFixed(2),
    }));
}

// 新浪资金流向原始字段（数值均为字符串）
interface MoneyFlowRaw {
  symbol?: string;
  name?: string | boolean; // 部分行没有名称，接口返回布尔 false
  trade?: string;
  changeratio?: string;
  netamount?: string;
  ratioamount?: string;
}

// 资金榜：全市场按净流入额取头部，asc=false 流入榜、true 流出榜
export async function fetchMoneyFlow(
  asc: boolean,
  num: number,
): Promise<MoneyFlowItem[]> {
  const url =
    "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php" +
    "/MoneyFlow.ssl_bkzj_ssggzj" +
    `?page=1&num=${num}&sort=netamount&asc=${asc ? 1 : 0}`;
  const list: MoneyFlowRaw[] = JSON.parse(await get(url));
  if (!Array.isArray(list)) return [];

  const rows: MoneyFlowItem[] = [];
  for (const d of list) {
    // 接口是「全市场个股 + 基金」口径，货基与国债 ETF 体量极大、常年占据榜单两端，
    // 按基金特征剔除；另有少量行没有名称（返回布尔 false），一并跳过
    if (typeof d?.name !== "string" || !d.name || !d.symbol) continue;
    if (isFund(d.symbol, d.name, safeNumber(d.trade))) continue;
    rows.push({
      code: d.symbol.toLowerCase(),
      name: d.name,
      current: safeNumber(d.trade).toFixed(2),
      // changeratio 是小数比值（0.1 即 10%），与行情中心的百分数字段不同
      changePercent: (safeNumber(d.changeratio) * 100).toFixed(2),
      netAmount: safeNumber(d.netamount),
      netRatio: (safeNumber(d.ratioamount) * 100).toFixed(1),
    });
  }
  return rows;
}

// 名称 -> 标准代码（新浪建议接口），无匹配返回 null
export async function searchCode(keyword: string): Promise<string | null> {
  const url = `https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15,21,22,23,24,25,31,32,33,34,35&key=${encodeURIComponent(keyword)}`;
  const data = await getGbk(url);
  const match = data.match(/var suggestvalue="([^"]+)"/);
  if (!match?.[1]) return null;

  const items = match[1].split(";").filter((i) => i.trim());
  for (const item of items) {
    const [, , , fullCode] = item.split(",");
    if (fullCode?.match(/^(sh|sz)\d{6}$/)) return fullCode;
  }
  return null;
}
