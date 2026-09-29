import {
  crowdAreasSchema,
  crowdSnapshotSchema,
  type CrowdSnapshot,
} from '../types/crowd';

export function subscribeCrowdSnapshots(
  onSnapshot: (snapshot: CrowdSnapshot) => void,
  onError: () => void,
): () => void {
  const controller = new AbortController();
  let source: EventSource | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 5000;

  const retry = () => {
    if (controller.signal.aborted) return;
    source?.close();
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void connect(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60_000);
  };

  const connect = async () => {
    try {
      const response = await fetch('/api/areas', {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15_000),
        ]),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Areas API: ${response.status}`);
      const { areas } = crowdAreasSchema.parse(await response.json());
      const floors = areas.filter((area) => area.floor !== undefined);
      const floorsByKey = new Map(floors.map((area) => [area.areaKey, area]));
      if (floorsByKey.size !== floors.length) {
        throw new Error('Duplicate crowd floor');
      }
      if (controller.signal.aborted) return;

      source = new EventSource('/api/crowd/stream?groupBy=floor');
      source.addEventListener(
        'building-crowd-snapshot',
        (event: MessageEvent<string>) => {
          if (controller.signal.aborted) return;
          try {
            const snapshot = crowdSnapshotSchema.parse(JSON.parse(event.data));
            if (
              snapshot.readings.length !== floors.length ||
              new Set(snapshot.readings.map((reading) => reading.areaKey))
                .size !== floors.length ||
              (snapshot.measuredAt === null &&
                snapshot.readings.some(
                  (reading) => reading.clientCount !== null,
                ))
            ) {
              throw new Error('Invalid crowd floor snapshot');
            }

            for (const reading of snapshot.readings) {
              const area = floorsByKey.get(reading.areaKey);
              if (
                area?.floor === undefined ||
                area.buildingKey !== reading.buildingKey
              ) {
                throw new Error(`Unknown crowd floor: ${reading.areaKey}`);
              }
            }

            retryDelay = 5000;
            onSnapshot(snapshot);
          } catch {
            onError();
            retry();
          }
        },
      );
      source.onerror = () => {
        if (controller.signal.aborted) return;
        onError();
        // EventSource retries interrupted connections itself, but stops on
        // HTTP errors such as 429 or 500. Restart those with backoff.
        if (source?.readyState === EventSource.CLOSED) retry();
      };
    } catch {
      if (controller.signal.aborted) return;
      onError();
      retry();
    }
  };

  void connect();

  return () => {
    controller.abort();
    source?.close();
    clearTimeout(retryTimer);
  };
}
