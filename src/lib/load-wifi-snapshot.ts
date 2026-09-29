import { isWifiSnapshot, type WifiSnapshot } from '../types/wifi';

export async function loadWifiSnapshot(
  signal: AbortSignal,
): Promise<WifiSnapshot> {
  const response = await fetch('/api/wifi/clients/list', {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Wi-Fi API: ${response.status}`);
  const snapshot: unknown = await response.json();
  if (
    !isWifiSnapshot(snapshot) ||
    !snapshot.clients.every(
      (client) =>
        typeof client.autoExcluded === 'boolean' &&
        typeof client.blacklisted === 'boolean',
    )
  ) {
    throw new Error('Invalid Wi-Fi snapshot or missing exclusion flags');
  }

  return {
    measuredAt: snapshot.measuredAt,
    clients: snapshot.clients.filter(
      (client) => !client.autoExcluded && !client.blacklisted,
    ),
  };
}
