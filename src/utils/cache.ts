// 接口级缓存原语：TTL 复用 + 同 key 合并请求 + 主动清空

interface CacheEntry {
  data: unknown[];
  // 取数成功的时刻（毫秒），面板据此展示数据实际的新鲜度
  fetchedAt: number;
  expireAt: number;
}

export interface CacheResult<T> {
  data: T[];
  // 本次数据对应的取数成功时刻；请求失败时为 null
  fetchedAt: number | null;
}

export interface CacheOptions<T> {
  key: string;
  // 缓存有效期（毫秒），从取数成功时刻起算
  ttl: number;
  // 真实取数，失败需抛出，异常处理统一由本层负责
  load: () => Promise<T[]>;
  // 空结果是否写入缓存，默认写入；源接口异常时会返回空数据要传 false，
  // 否则“暂无数据”会钉在面板上整整一个 TTL
  cacheEmpty?: boolean;
}

let epoch = 0;
const store = new Map<string, CacheEntry>();
// 进行中的请求：同 key 并发只发一次；带代际号，清空前的请求不会被清空后复用
const inflight = new Map<
  string,
  { epoch: number; promise: Promise<CacheResult<unknown>> }
>();

// 条目上限，超出后先清理过期项，再按写入先后淘汰，避免长跑会话里 key 无限堆积
const MAX_ENTRIES = 200;

function prune(): void {
  if (store.size < MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.expireAt) store.delete(key);
  }
  for (const key of store.keys()) {
    if (store.size < MAX_ENTRIES) break;
    store.delete(key);
  }
}

// 清空全部缓存：在途请求的结果不再回写，下一次读取重新取数
export function resetCache(): void {
  epoch += 1;
  store.clear();
}

// 按条件清空缓存
export function invalidateWhere(match: (key: string) => boolean): void {
  for (const key of store.keys()) {
    if (match(key)) store.delete(key);
  }
}

// 带缓存的取数：命中直接返回数据与它对应的成功时刻，失败返回空数组
export async function cachedFetch<T>(
  options: CacheOptions<T>,
): Promise<CacheResult<T>> {
  const { key, ttl, load, cacheEmpty = true } = options;

  const cached = store.get(key);
  if (cached && Date.now() < cached.expireAt) {
    return { data: cached.data as T[], fetchedAt: cached.fetchedAt };
  }

  const pending = inflight.get(key);
  if (pending && pending.epoch === epoch) {
    return pending.promise as Promise<CacheResult<T>>;
  }

  const myEpoch = epoch;
  const request = {
    epoch: myEpoch,
    promise: load()
      .then((data): CacheResult<T> => {
        const fetchedAt = Date.now();
        // 清空后不再回写：刷新期间发出的旧请求不能把过期数据写回缓存
        if (myEpoch === epoch && (cacheEmpty || data.length > 0)) {
          prune();
          store.set(key, { data, fetchedAt, expireAt: fetchedAt + ttl });
        }
        return { data, fetchedAt };
      })
      .catch((e: unknown): CacheResult<T> => {
        console.error(`[watch-stock] 接口请求失败 ${key}:`, e);
        return { data: [], fetchedAt: null };
      }),
  };
  inflight.set(key, request);

  // 结束后释放槽位；比对身份避免误删清空后新建的同 key 请求
  void request.promise.finally(() => {
    if (inflight.get(key) === request) inflight.delete(key);
  });

  return request.promise;
}
