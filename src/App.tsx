import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import HierarchyTreemap from './components/hierarchy-treemap';
import { buildFloorData } from './treemap';
import { loadCrowdSnapshot } from './lib/load-crowd-snapshot';
import type { CrowdSnapshot } from './types/crowd';

const REFRESH_MS = 5 * 60 * 1000;
const refreshBucket = (time: number) => Math.floor(time / REFRESH_MS);
const TIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default function App() {
  const [snapshot, setSnapshot] = createSignal<CrowdSnapshot | null>(null);
  const [error, setError] = createSignal(false);
  const data = createMemo(() => buildFloorData(snapshot()?.readings ?? []));
  const total = createMemo(
    () =>
      snapshot()?.readings.reduce(
        (sum, reading) => sum + (reading.clientCount ?? 0),
        0,
      ) ?? 0,
  );
  const missingCount = createMemo(
    () =>
      snapshot()?.readings.filter((reading) => reading.clientCount === null)
        .length ?? 0,
  );
  const hasObservation = createMemo(
    () =>
      snapshot()?.readings.some((reading) => reading.clientCount !== null) ??
      false,
  );

  onMount(() => {
    const controller = new AbortController();
    let loading = false;

    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const next = await loadCrowdSnapshot(controller.signal);
        if (controller.signal.aborted) return;
        setSnapshot(next);
        setError(false);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        loading = false;
      }
    };

    let lastBucket = refreshBucket(Date.now());
    void load();

    let refreshTimer = 0;
    const scheduleRefresh = () => {
      const delay = REFRESH_MS - (Date.now() % REFRESH_MS) + 1000;
      refreshTimer = window.setTimeout(() => {
        const bucket = refreshBucket(Date.now());
        if (bucket !== lastBucket) {
          lastBucket = bucket;
          void load();
        }
        scheduleRefresh();
      }, delay);
    };
    scheduleRefresh();

    onCleanup(() => {
      controller.abort();
      window.clearTimeout(refreshTimer);
    });
  });

  return (
    <HierarchyTreemap
      data={data()}
      class='fixed inset-0'
      ariaLabel='棟・階別のWi-Fi接続端末数'
    >
      <Show when={!snapshot() || total() === 0}>
        <p
          class='absolute inset-0 flex items-center justify-center text-sm text-muted-foreground'
          role='status'
        >
          {error()
            ? 'Wi-Fi接続情報を取得できませんでした。'
            : snapshot()
              ? !hasObservation()
                ? '観測データはありません。'
                : missingCount() > 0
                  ? '観測済みの階に接続中の端末はありません。'
                  : '接続中の端末はありません。'
              : 'Wi-Fi接続情報を読み込み中…'}
        </p>
      </Show>
      <Show when={snapshot()}>
        {(value) => (
          <div
            class='pointer-events-none fixed right-2 bottom-2 rounded bg-background/85 px-2 py-1 text-xs text-foreground'
            role='status'
          >
            <Show when={value().measuredAt} fallback='観測時刻なし'>
              {(measuredAt) => TIME_FORMATTER.format(new Date(measuredAt()))}
            </Show>{' '}
            · {hasObservation() ? total() : '観測なし'}
            {missingCount() > 0 ? ` · ${missingCount()}階観測なし` : ''}
            {value().processingPending ? ' · 最新データを処理中' : ''}
            {error() ? ' · 更新に失敗（前回の観測を表示）' : ''}
          </div>
        )}
      </Show>
    </HierarchyTreemap>
  );
}
