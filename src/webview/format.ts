// webview 端格式化工具（量级格式化与小数位规则见 shared/format，两端共用）

export function fmtNum(n: number | string | null | undefined, d = 2): string {
  const v = Number(n);
  return n == null || n === "" || isNaN(v) ? "-" : v.toFixed(d);
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
