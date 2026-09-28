// 监控快照缓存的通用清理（封单 / 大单结构一致，共用此实现）

// 删除指定 key，不传则清空整个缓存
export function clearCache<T>(cache: Map<string, T>, key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}
