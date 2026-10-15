// 接口级缓存原语：TTL 复用 + 同 key 单飞 + 主动穿透 + 失败降级

interface CacheEntry {
  data: unknown;
  expireAt: number;
  epoch: number;
}

export interface CacheOptions<T> {
  key: string;
  // 缓存有效期（毫秒），从取数成功时刻起算
  ttl: number;
  // 真实取数，失败需抛出，异常处理统一由本层负责
  load: () => Promise<T>;
  // 无缓存可退时的兜底值
  fallback: T;
  // 空结果是否写入缓存，默认写入；接口异常会返回空的数据要传 false，
  // 否则"暂无数据"会钉在面板上整整一个 TTL
  cacheEmpty?: boolean;
  // 空结果判定，默认按空数组判定
  isEmpty?: (data: T) => boolean;
}

// 代际号：自增即让既有缓存全部失效（主动刷新）；
// 不直接清空 store，是为了失败时还能退回上一代数据
let epoch = 0;

const store = new Map<string, CacheEntry>();
// 进行中的请求：同 key 并发只发一次，避免切标签等场景重复打接口
const inflight = new Map<string, { epoch: number; promise: Promise<unknown> }>();

// 条目上限，超出后先清理过期项，避免搜索词这类长尾 key 无限堆积
const MAX_ENTRIES = 200;

function prune(): void {
  if (store.size < MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of [...store]) {
    if (now >= entry.expireAt) store.delete(key);
  }
  // 仍超限说明未过期的活跃 key 太多，按最早到期淘汰：只清过期项的话，
  // 一条都不过期时上限形同虚设，缓存照旧涨
  if (store.size < MAX_ENTRIES) return;
  const byExpire = [...store].sort((a, b) => a[1].expireAt - b[1].expireAt);
  for (const [key] of byExpire) {
    if (store.size < MAX_ENTRIES) break;
    store.delete(key);
  }
}

// 主动刷新：全部缓存立即失效，下一次读取重新取数
export function bumpEpoch(): void {
  epoch += 1;
}

// 清空全部缓存
export function clearCache(): void {
  store.clear();
}

// 按条件清空缓存
export function invalidateWhere(match: (key: string) => boolean): void {
  for (const key of store.keys()) {
    if (match(key)) store.delete(key);
  }
}

// 带缓存的取数：命中直接返回，否则取数并按需写回
export async function cachedFetch<T>(options: CacheOptions<T>): Promise<T> {
  const { key, ttl, load, fallback, cacheEmpty = true, isEmpty } = options;

  const cached = store.get(key);
  if (cached && cached.epoch === epoch && Date.now() < cached.expireAt) {
    return cached.data as T;
  }

  const pending = inflight.get(key);
  if (pending && pending.epoch === epoch) return pending.promise as Promise<T>;

  const myEpoch = epoch;
  const promise = load()
    .then((data) => {
      const empty = isEmpty
        ? isEmpty(data)
        : Array.isArray(data) && data.length === 0;
      // 代际变更后不再回写：主动刷新期间，旧请求不能把过期数据写回缓存
      if (myEpoch === epoch && (cacheEmpty || !empty)) {
        prune();
        store.set(key, { data, expireAt: Date.now() + ttl, epoch: myEpoch });
      }
      return data;
    })
    .catch((e: unknown) => {
      console.error(`[watch-stock] 接口请求失败 ${key}:`, e);
      // 降级：优先复用上次成功数据，避免一次网络抖动把面板打空
      return (store.get(key)?.data as T | undefined) ?? fallback;
    });
  inflight.set(key, { epoch: myEpoch, promise });

  // 结束即释放槽位（失败也释放，否则一次失败会被后续调用反复复用）；
  // 比对身份是为避免误删代际切换后新建的同 key 请求
  void promise.finally(() => {
    if (inflight.get(key)?.promise === promise) inflight.delete(key);
  });

  return promise;
}
