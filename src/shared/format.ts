// 扩展端与 webview 共用的格式化工具，环境无关（不依赖 vscode / DOM / node 类型）

/** 量级档位：[阈值, 单位后缀, 小数位数]，按阈值从大到小排列 */
type ScaleStep = readonly [threshold: number, unit: string, digits: number];

/** 金额档位：万亿 / 亿 / 万 */
const MONEY_STEPS: readonly ScaleStep[] = [
  [1e12, "万亿", 2],
  [1e8, "亿", 1],
  [1e4, "万", 0],
];

/** 成交量（手）档位：比金额多保留一位小数，让分时图上的分钟波动可辨 */
const VOLUME_STEPS: readonly ScaleStep[] = [
  [1e8, "亿", 2],
  [1e4, "万", 1],
];

/**
 * 按量级分档格式化
 * @param unit 低于最小档位时使用的单位后缀
 * @returns 分档后的文本；无效值与 0 一律返回 "-"
 */
function scaleFormat(
  value: number | null | undefined,
  steps: readonly ScaleStep[],
  unit = "",
): string {
  if (value == null || !isFinite(value) || value === 0) return "-";
  for (const [threshold, stepUnit, digits] of steps) {
    if (Math.abs(value) >= threshold) {
      return (value / threshold).toFixed(digits) + stepUnit;
    }
  }
  return value.toFixed(0) + unit;
}

/** 金额（封单等），最低档带"元"后缀 */
export const formatAmount = (v: number | null | undefined): string =>
  scaleFormat(v, MONEY_STEPS, "元");

/** 金额（成交额、市值） */
export const formatMoney = (v: number | null | undefined): string =>
  scaleFormat(v, MONEY_STEPS);

/** 成交量（手） */
export const formatVolume = (v: number | null | undefined): string =>
  scaleFormat(v, VOLUME_STEPS);

/** 价格小数位：ETF/基金 3 位，其余 2 位 */
export const decOf = (isETF: boolean): number => (isETF ? 3 : 2);
