import { Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import HierarchyTreemap from './components/hierarchy-treemap';
import { buildAccessPointData, type WifiSnapshot } from './treemap';
import { loadWifiSnapshot } from './lib/load-wifi-snapshot';

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
  const [snapshot, setSnapshot] = createSignal<WifiSnapshot | null>(null);
  const [error, setError] = createSignal(false);
  const data = createMemo(() =>
    buildAccessPointData(snapshot()?.clients ?? []),
  );

  onMount(() => {
    const controller = new AbortController();
    let loading = false;

    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const next = await loadWifiSnapshot(controller.signal);
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
      ariaLabel='棟・階・AP別のWi-Fi接続端末数'
    >
      <Show when={!snapshot() || snapshot()?.clients.length === 0}>
        <p
          class='absolute inset-0 flex items-center justify-center text-sm text-muted-foreground'
          role='status'
        >
          {error()
            ? 'Wi-Fi接続情報を取得できませんでした。'
            : snapshot()
              ? '接続中の端末はありません。'
              : 'Wi-Fi接続情報を読み込み中…'}
        </p>
      </Show>
      <Show when={snapshot()}>
        {(value) => (
          <div
            class='pointer-events-none fixed right-2 bottom-2 rounded bg-background/85 px-2 py-1 text-xs text-foreground'
            role='status'
          >
            {TIME_FORMATTER.format(new Date(value().measuredAt))} ·{' '}
            {value().clients.length}
            {error() ? ' · 更新に失敗（前回の観測を表示）' : ''}
          </div>
        )}
      </Show>
    </HierarchyTreemap>
  );
}
