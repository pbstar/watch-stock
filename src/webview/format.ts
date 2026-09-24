// webview 端格式化工具

export function fmtNum(n: number | string | null | undefined, d = 2): string {
  const v = Number(n);
  return n == null || n === "" || isNaN(v) ? "-" : v.toFixed(d);
}

// 成交量（手）
export function fmtVol(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "-";
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "万";
  return String(Math.round(n));
}

// 金额（元）
export function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(n) || n === 0) return "-";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "万亿";
  if (n >= 1e8) return (n / 1e8).toFixed(1) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(0) + "万";
  return n.toFixed(0);
}

// 涨跌方向样式类
export function dirClass(changePercent: string | number): string {
  const v = Number(changePercent);
  return v > 0 ? "up" : v < 0 ? "dn" : "";
}

// 带正号的数值文本
export function signed(value: string | number, suffix = ""): string {
  return (Number(value) > 0 ? "+" : "") + value + suffix;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
