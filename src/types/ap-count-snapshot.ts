import type { WifiClient, WifiSnapshot } from './wifi';

interface ApCount {
  accessPointName: string;
  buildingKey?: string;
  clientCount: number;
}

function parseTomlString(value: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Invalid quoted string in AP-count TOML');
  }
  if (typeof parsed !== 'string') {
    throw new Error('Expected a string in AP-count TOML');
  }
  return parsed;
}

export function parseApCountSnapshotToml(toml: string): WifiSnapshot {
  let measuredAt: string | undefined;
  const accessPoints: Array<Partial<ApCount>> = [];
  let currentAccessPoint: Partial<ApCount> | undefined;

  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === '[[access_points]]') {
      currentAccessPoint = {};
      accessPoints.push(currentAccessPoint);
      continue;
    }

    const match = /^([a-z_]+)\s*=\s*(.+)$/.exec(line);
    if (!match) throw new Error('Invalid line in AP-count TOML');
    const [, key, value] = match;

    if (!currentAccessPoint) {
      if (key === 'format_version' && value === '1') continue;
      if (key === 'measured_at') {
        measuredAt = parseTomlString(value);
        continue;
      }
      throw new Error(`Unexpected top-level key in AP-count TOML: ${key}`);
    }

    if (key === 'name') {
      currentAccessPoint.accessPointName = parseTomlString(value);
    } else if (key === 'building_key') {
      currentAccessPoint.buildingKey = parseTomlString(value);
    } else if (key === 'client_count' && /^(0|[1-9]\d*)$/.test(value)) {
      currentAccessPoint.clientCount = Number(value);
    } else {
      throw new Error(`Unexpected or invalid AP-count TOML field: ${key}`);
    }
  }

  if (!measuredAt || !Number.isFinite(Date.parse(measuredAt))) {
    throw new Error('AP-count TOML is missing a valid measured_at');
  }

  const clients: WifiClient[] = [];
  for (const accessPoint of accessPoints) {
    if (
      typeof accessPoint.accessPointName !== 'string' ||
      typeof accessPoint.clientCount !== 'number'
    ) {
      throw new Error('AP-count TOML contains an incomplete access point');
    }
    for (let index = 0; index < accessPoint.clientCount; index += 1) {
      clients.push({
        accessPointName: accessPoint.accessPointName,
        ...(accessPoint.buildingKey
          ? { buildingKey: accessPoint.buildingKey }
          : {}),
      });
    }
  }

  return { measuredAt, clients };
}
