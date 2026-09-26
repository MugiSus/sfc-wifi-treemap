import { isWifiSnapshot, type WifiSnapshot } from '../src/types/wifi.ts';

interface Env {
  ASSETS: Fetcher;
  WIFI_STATE: KVNamespace;
}

const API_PREFIX = '/api';
const API_ORIGIN = 'https://api.dtc.wide.ad.jp';
const CLIENTS_PATH = '/wifi/clients/list';
const EXCLUDED_KEY = 'excluded-ids';

function dateInTokyo(time: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(time);
}

function idsFrom(snapshot: WifiSnapshot): Set<string> {
  const ids = new Set<string>();

  for (const client of snapshot.clients) {
    if (typeof client.randomId !== 'string' || client.randomId.length === 0) {
      throw new Error(
        'Wi-Fi client response is missing a string "randomId" field',
      );
    }
    ids.add(client.randomId);
  }

  return ids;
}

async function readUpstream(): Promise<WifiSnapshot> {
  const response = await fetch(`${API_ORIGIN}${CLIENTS_PATH}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok)
    throw new Error(`Upstream Wi-Fi API returned ${response.status}`);

  const body: unknown = await response.json();
  if (!isWifiSnapshot(body)) {
    throw new Error(
      'Wi-Fi API response does not match the expected snapshot shape',
    );
  }

  return body;
}

async function recordDailySnapshot(
  env: Env,
  scheduledTime: number,
): Promise<void> {
  const snapshot = await readUpstream();
  const date = dateInTokyo(scheduledTime);
  const measuredTime = Date.parse(snapshot.measuredAt);
  if (!Number.isFinite(measuredTime) || dateInTokyo(measuredTime) !== date) {
    throw new Error(
      `Refusing stale Wi-Fi snapshot: expected a ${date} JST observation, got ${snapshot.measuredAt}`,
    );
  }
  const current = idsFrom(snapshot);

  // randomId rotates by observation day, so only today's snapshot is useful.
  await env.WIFI_STATE.put(EXCLUDED_KEY, JSON.stringify([...current]));
  console.log(`Stored ${current.size} client IDs observed for ${date} JST.`);
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${API_PREFIX}/`))
      return env.ASSETS.fetch(request);

    const upstreamPath = url.pathname.slice(API_PREFIX.length);
    const target = new URL(upstreamPath + url.search, API_ORIGIN);
    const response = await fetch(target, {
      method: request.method,
      headers: request.headers,
    });
    if (!response.ok || upstreamPath !== CLIENTS_PATH) return response;

    const body: unknown = await response.clone().json();
    if (!isWifiSnapshot(body)) return response;

    const excluded = new Set(
      (await env.WIFI_STATE.get<string[]>(EXCLUDED_KEY, 'json')) ?? [],
    );
    const filtered: WifiSnapshot = {
      ...body,
      clients: body.clients.filter(
        (client) => !client.randomId || !excluded.has(client.randomId),
      ),
    };

    return Response.json(filtered, {
      status: response.status,
      headers: { 'cache-control': 'no-store' },
    });
  },

  async scheduled(controller, env) {
    await recordDailySnapshot(env, controller.scheduledTime);
  },
};

export default worker;
