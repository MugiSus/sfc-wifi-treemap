import { isWifiSnapshot, type WifiSnapshot } from '../src/types/wifi.ts';

interface Env {
  ASSETS: Fetcher;
  WIFI_STATE: KVNamespace;
}

const API_PREFIX = '/api';
const API_ORIGIN = 'https://api.dtc.wide.ad.jp';
const CLIENTS_PATH = '/wifi/clients/list';
const AP_COUNTS_PATH = '/api/wifi/ap-counts/latest.toml';
const AP_COUNTS_LATEST_KEY = 'ap-counts:latest.toml';
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
      `Refusing stale per-AP connection-count snapshot: expected a ${date} JST observation, got ${snapshot.measuredAt}`,
    );
  }

  const toml = renderApCountToml(snapshot, countAccessPoints(snapshot));
  await env.WIFI_STATE.put(`ap-counts:${date}.toml`, toml, {
    expirationTtl: AP_COUNTS_TTL_SECONDS,
  });
  await env.WIFI_STATE.put(AP_COUNTS_LATEST_KEY, toml);
  console.log(
    `Stored per-AP connected-client counts for ${date} JST (${snapshot.clients.length} clients).`,
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
    return response;
  },

  async scheduled(controller, env) {
    if (controller.cron === AP_COUNTS_CRON) {
      await recordApCountSnapshot(env, controller.scheduledTime);
    }
  },
};

export default worker;
