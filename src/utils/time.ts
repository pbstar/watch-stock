// 交易时间工具

// 一天中各关键时间点（距午夜分钟数）
const TIME_MORNING_AUCTION_START = 555; // 9:15  早盘集合竞价开始
const TIME_MORNING_AUCTION_END = 565; // 9:25  早盘集合竞价结束
const TIME_MORNING_START = 570; // 9:30  早盘开始
const TIME_MORNING_STABLE_START = 572; // 9:32  早盘稳定交易开始
const TIME_MORNING_STABLE_END = 689; // 11:29  早盘稳定交易结束
const TIME_MORNING_END = 690; // 11:30 早盘收盘
const TIME_AFTERNOON_START = 780; // 13:00 午盘开盘
const TIME_AFTERNOON_STABLE_START = 781; // 13:01  午盘稳定交易开始
const TIME_AFTERNOON_STABLE_END = 895; // 14:55  午盘稳定交易结束
const TIME_AFTERNOON_AUCTION_START = 897; // 14:57 午盘集合竞价开始
const TIME_AFTERNOON_END = 900; // 15:00 午盘收盘/午盘集合竞价结束

// 是否为A股交易时间（工作日 9:15-11:30 和 13:00-15:00）
export function isTradingTime(now: Date): boolean {
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    (minutes >= TIME_MORNING_START && minutes <= TIME_MORNING_END) ||
    (minutes >= TIME_AFTERNOON_START && minutes <= TIME_AFTERNOON_END)
  );
}

// 稳定交易时间 9:32-11:29 13:01-14:55
export function isStableTradeTime(now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    (minutes >= TIME_MORNING_STABLE_START &&
      minutes <= TIME_MORNING_STABLE_END) ||
    (minutes >= TIME_AFTERNOON_STABLE_START &&
      minutes <= TIME_AFTERNOON_STABLE_END)
  );
}

// 早盘集合竞价 9:15-9:25
export function isMorningAuctionTime(now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    minutes >= TIME_MORNING_AUCTION_START && minutes <= TIME_MORNING_AUCTION_END
  );
}

// 尾盘集合竞价 14:57-15:00
export function isAfternoonAuctionTime(now: Date): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    minutes >= TIME_AFTERNOON_AUCTION_START && minutes <= TIME_AFTERNOON_END
  );
}

// 生成 A 股完整交易时间槽（242 个）
export function buildTimeSlots(date: string): string[] {
  const slots: string[] = [];
  const push = (t: number): void => {
    const h = String(Math.floor(t / 60)).padStart(2, "0");
    const m = String(t % 60).padStart(2, "0");
    slots.push(`${date} ${h}:${m}`);
  };
  for (let t = TIME_MORNING_START; t <= TIME_MORNING_END; t++) push(t);
  for (let t = TIME_AFTERNOON_START; t <= TIME_AFTERNOON_END; t++) push(t);
  return slots;
}
