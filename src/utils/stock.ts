// 股票相关纯工具函数

// 是否为基金/ETF（按代码前缀、名称关键词、低价基金特征综合判断）
export function isFund(code: string, name: string, current: number): boolean {
  const codeNum = code.substring(2);
  const isFundByCode =
    (code.startsWith("sh") && codeNum.startsWith("5")) ||
    (code.startsWith("sz") && codeNum.startsWith("1"));
  return (
    isFundByCode ||
    (!!name && (name.includes("ETF") || name.includes("LOF"))) ||
    (current > 0 &&
      current < 3 &&
      !!name &&
      (name.includes("基金") || name.includes("指数")))
  );
}

// 是否为基金代码（6位纯数字且首位为 5 或 1）
export function isFundCode(code: string): boolean {
  return /^[51]\d{5}$/.test(code);
}

// 价格小数位数
export function getDecimals(isETF: boolean): number {
  return isETF ? 3 : 2;
}

// 安全转数字
export function safeNumber(val: unknown): number {
  const n = parseFloat(String(val));
  return isNaN(n) ? 0 : n;
}

// 验证股票代码格式
export function isValidStockCode(code: unknown): boolean {
  if (!code || typeof code !== "string") return false;
  return /^(sh|sz|bj)[0-9]{6}$/i.test(code);
}

// 涨跌幅限制（百分比）：ST 5%、创业板/科创板 20%、北交所 30%、其余 10%
export function getLimitPercent(code: string, name: string): number {
  if (name && /ST/i.test(name)) return 5;
  if (code.startsWith("sz30")) return 20;
  if (code.startsWith("sh68")) return 20;
  if (code.startsWith("bj")) return 30;
  return 10;
}

// 金额格式化
export function formatAmount(amount: number): string {
  if (amount >= 100000000) return (amount / 100000000).toFixed(1) + "亿";
  if (amount >= 10000) return (amount / 10000).toFixed(0) + "万";
  return Math.round(amount) + "元";
}

// 简称显示名：优先用用户配置的简称，未配置时截取名称前两位（状态栏与查看面板共用）
export function miniName(
  code: string,
  name: string,
  miniNames: Record<string, string>,
): string {
  return miniNames[code] || (name.length > 2 ? name.substring(0, 2) : name);
}
