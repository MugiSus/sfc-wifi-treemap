import {
  crowdAreasSchema,
  crowdSnapshotSchema,
  type CrowdSnapshot,
} from '../types/crowd';

export async function loadCrowdSnapshot(
  signal: AbortSignal,
): Promise<CrowdSnapshot> {
  const [response, areasResponse] = await Promise.all([
    fetch('/api/crowd?groupBy=floor', { signal, cache: 'no-store' }),
    fetch('/api/areas', { signal, cache: 'no-store' }),
  ]);
  if (!response.ok) throw new Error(`Crowd API: ${response.status}`);
  if (!areasResponse.ok) throw new Error(`Areas API: ${areasResponse.status}`);

  const snapshot = crowdSnapshotSchema.parse(await response.json());
  const { areas } = crowdAreasSchema.parse(await areasResponse.json());
  const floors = areas.filter((area) => area.floor !== undefined);
  const floorsByKey = new Map(floors.map((area) => [area.areaKey, area]));
  if (
    floorsByKey.size !== floors.length ||
    snapshot.readings.length !== floors.length ||
    new Set(snapshot.readings.map((reading) => reading.areaKey)).size !==
      floors.length ||
    (snapshot.measuredAt === null &&
      snapshot.readings.some((reading) => reading.clientCount !== null))
  ) {
    throw new Error('Invalid crowd floor snapshot');
  }

  for (const reading of snapshot.readings) {
    const area = floorsByKey.get(reading.areaKey);
    if (area?.floor === undefined || area.buildingKey !== reading.buildingKey) {
      throw new Error(`Unknown crowd floor: ${reading.areaKey}`);
    }
  }

  return snapshot;
}
