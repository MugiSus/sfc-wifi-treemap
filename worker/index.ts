import { isWifiSnapshot, type WifiSnapshot } from '../src/types/wifi.ts';

interface Env {
  ASSETS: Fetcher;
  WIFI_STATE: KVNamespace;
}

const API_PREFIX = '/api';
const API_ORIGIN = 'https://api.dtc.wide.ad.jp';
const CLIENTS_PATH = '/wifi/clients/list';
const AP_COUNTS_PATH = '/api/wifi/ap-counts/latest.toml';
const EXCLUDED_KEY = 'excluded-ids';
const AP_COUNTS_LATEST_KEY = 'ap-counts:latest.toml';
const EXCLUSION_CRON = '15 15 * * *';
const AP_COUNTS_CRON = '0 18 * * *';
const AP_COUNTS_TTL_SECONDS = 90 * 24 * 60 * 60;

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

interface AccessPointCount {
  accessPointName: string;
  buildingKey?: string;
  clientCount: number;
}

function countAccessPoints(snapshot: WifiSnapshot): AccessPointCount[] {
  const counts = new Map<string, AccessPointCount>();

  for (const client of snapshot.clients) {
    const accessPointName = client.accessPointName;
    if (!accessPointName) {
      throw new Error('Wi-Fi client response has an empty accessPointName');
    }
    const buildingKey = client.buildingKey;
    const key = JSON.stringify([buildingKey ?? '', accessPointName]);
    const existing = counts.get(key);
    if (existing) {
      existing.clientCount += 1;
    } else {
      counts.set(key, { accessPointName, buildingKey, clientCount: 1 });
    }
  }

  return [...counts.values()].sort(
    (a, b) =>
      (a.buildingKey ?? '').localeCompare(b.buildingKey ?? '') ||
      a.accessPointName.localeCompare(b.accessPointName),
  );
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function renderApCountToml(
  snapshot: WifiSnapshot,
  accessPoints: AccessPointCount[],
): string {
  const lines = [
    'format_version = 1',
    `measured_at = ${tomlString(snapshot.measuredAt)}`,
    '',
  ];

  for (const accessPoint of accessPoints) {
    lines.push(
      '[[access_points]]',
      `name = ${tomlString(accessPoint.accessPointName)}`,
    );
    if (accessPoint.buildingKey) {
      lines.push(`building_key = ${tomlString(accessPoint.buildingKey)}`);
    }
    lines.push(`client_count = ${accessPoint.clientCount}`, '');
  }

  return `${lines.join('\n')}\n`;
}

async function recordApCountSnapshot(
  env: Env,
  scheduledTime: number,
): Promise<void> {
  const snapshot = await readUpstream();
  const date = dateInTokyo(scheduledTime);
  const measuredTime = Date.parse(snapshot.measuredAt);
  if (!Number.isFinite(measuredTime) || dateInTokyo(measuredTime) !== date) {
    throw new Error(
      `Refusing stale AP-count snapshot: expected a ${date} JST observation, got ${snapshot.measuredAt}`,
    );
  }

  const toml = renderApCountToml(snapshot, countAccessPoints(snapshot));
  await env.WIFI_STATE.put(`ap-counts:${date}.toml`, toml, {
    expirationTtl: AP_COUNTS_TTL_SECONDS,
  });
  await env.WIFI_STATE.put(AP_COUNTS_LATEST_KEY, toml);
  console.log(
    `Stored AP counts for ${date} JST (${snapshot.clients.length} clients).`,
  );
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === AP_COUNTS_PATH) {
      if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 });
      }
      const toml = await env.WIFI_STATE.get(AP_COUNTS_LATEST_KEY, 'text');
      if (toml === null) {
        return new Response('No AP-count snapshot available yet', {
          status: 404,
        });
      }
      return new Response(toml, {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'application/toml; charset=utf-8',
        },
      });
    }

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
    if (controller.cron === EXCLUSION_CRON) {
      await recordDailySnapshot(env, controller.scheduledTime);
    } else if (controller.cron === AP_COUNTS_CRON) {
      await recordApCountSnapshot(env, controller.scheduledTime);
    }
  },
};

export default worker;
