// 交易时间工具

// 一天中各关键时间点（距午夜分钟数）
const TIME_MORNING_OPEN = 555; // 9:15  早盘集合竞价开始
const TIME_MORNING_AUCTION_END = 565; // 9:25  早盘集合竞价结束
const TIME_MORNING_TRADE_START = 570; // 9:30  早盘连续竞价开始
const TIME_MORNING_CLOSE = 690; // 11:30 早盘收盘
const TIME_AFTERNOON_OPEN = 780; // 13:00 午盘开盘
const TIME_AFTERNOON_AUCTION = 897; // 14:57 尾盘集合竞价开始
const TIME_AFTERNOON_CLOSE = 900; // 15:00 收盘

// 是否为A股交易时间（工作日 9:15-11:30 和 13:00-15:00）
export function isTradingTime(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    (minutes >= TIME_MORNING_OPEN && minutes <= TIME_MORNING_CLOSE) ||
    (minutes >= TIME_AFTERNOON_OPEN && minutes <= TIME_AFTERNOON_CLOSE)
  );
}

// 早盘集合竞价 9:15-9:25
export function isMorningAuctionTime(): boolean {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= TIME_MORNING_OPEN && minutes <= TIME_MORNING_AUCTION_END;
}

// 尾盘集合竞价 14:57-15:00
export function isAfternoonAuctionTime(): boolean {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= TIME_AFTERNOON_AUCTION && minutes <= TIME_AFTERNOON_CLOSE;
}

// 生成 A 股完整交易时间槽（242 个）
export function buildTimeSlots(date: string): string[] {
  const slots: string[] = [];
  const push = (t: number): void => {
    const h = String(Math.floor(t / 60)).padStart(2, "0");
    const m = String(t % 60).padStart(2, "0");
    slots.push(`${date} ${h}:${m}`);
  };
  for (let t = TIME_MORNING_TRADE_START; t <= TIME_MORNING_CLOSE; t++) push(t);
  for (let t = TIME_AFTERNOON_OPEN; t <= TIME_AFTERNOON_CLOSE; t++) push(t);
  return slots;
}
