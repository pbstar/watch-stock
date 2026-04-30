// 交易时间工具

// 是否为A股交易时间（工作日 9:15-11:30 和 13:00-15:00）
export function isTradingTime(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    (minutes >= 555 && minutes <= 690) || // 9:15-11:30
    (minutes >= 780 && minutes <= 900) // 13:00-15:00
  );
}

// 早盘集合竞价 9:15-9:25
export function isMorningAuctionTime(): boolean {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 555 && minutes <= 565;
}

// 尾盘集合竞价 14:57-15:00
export function isAfternoonAuctionTime(): boolean {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 897 && minutes <= 900;
}

// 生成 A 股完整交易时间槽（242 个）
export function buildTimeSlots(date: string): string[] {
  const slots: string[] = [];
  const push = (t: number): void => {
    const h = String(Math.floor(t / 60)).padStart(2, "0");
    const m = String(t % 60).padStart(2, "0");
    slots.push(`${date} ${h}:${m}`);
  };
  for (let t = 570; t <= 690; t++) push(t);
  for (let t = 780; t <= 900; t++) push(t);
  return slots;
}
