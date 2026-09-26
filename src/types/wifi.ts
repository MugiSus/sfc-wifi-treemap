export interface WifiClient {
  accessPointName: string;
  buildingKey?: string;
  randomId?: string;
}

export interface WifiSnapshot {
  measuredAt: string;
  clients: WifiClient[];
}

export function isWifiClient(value: unknown): value is WifiClient {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('accessPointName' in value) ||
    typeof value.accessPointName !== 'string'
  ) {
    return false;
  }

  return (
    (!('buildingKey' in value) || typeof value.buildingKey === 'string') &&
    (!('randomId' in value) || typeof value.randomId === 'string')
  );
}

export function isWifiSnapshot(value: unknown): value is WifiSnapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    'measuredAt' in value &&
    typeof value.measuredAt === 'string' &&
    Number.isFinite(Date.parse(value.measuredAt)) &&
    'clients' in value &&
    Array.isArray(value.clients) &&
    value.clients.every(isWifiClient)
  );
}
