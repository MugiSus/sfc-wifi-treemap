import { select } from 'd3-selection'
import { zoom, zoomIdentity, type D3ZoomEvent } from 'd3-zoom'
import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import {
  buildAccessPointHierarchy, layoutAccessPoints, TREEMAP_PADDING, type WifiSnapshot,
} from './treemap'

const WIFI_URL = '/api/wifi/clients/list'
const REFRESH_MS = 5 * 60 * 1000
const refreshBucket = (time: number) => Math.floor(time / REFRESH_MS)
const RED_CLIENTS = 80
const LABEL_PADDING = 8
const LABEL_MIN_SIZE = 10
const LABEL_MAX_SIZE = 32
const HEADER_SIZE = 12
const TIME_FORMATTER = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
})

export default function App() {
  let container!: HTMLElement
  const measurement = document.createElement('canvas').getContext('2d')!
  const [fontFamily, setFontFamily] = createSignal('sans-serif')
  const [transform, setTransform] = createSignal(zoomIdentity)
  const scale = createMemo(() => transform().k)
  const [dragging, setDragging] = createSignal(false)
  const [snapshot, setSnapshot] = createSignal<WifiSnapshot | null>(null)
  const [error, setError] = createSignal(false)
  const [viewport, setViewport] = createSignal({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  const hierarchy = createMemo(() => buildAccessPointHierarchy(snapshot()?.clients ?? []))
  const layout = createMemo(() => {
    const { width, height } = viewport()
    return layoutAccessPoints.size([width * scale(), height * scale()])(hierarchy()).descendants().slice(1)
  })
  const nodeIds = createMemo(() => layout().map((node) => node.data.id))
  const nodes = createMemo(() => new Map(layout().map((node) => [node.data.id, node])))

  onMount(() => {
    setFontFamily(getComputedStyle(container).fontFamily)
    let zoomFrame = 0
    let endZoomFrame = 0
    let pendingTransform = zoomIdentity
    const surface = select(container)
    const navigation = zoom<HTMLElement, unknown>()
      .extent((): [[number, number], [number, number]] => [[0, 0], [viewport().width, viewport().height]])
      .translateExtent([[0, 0], [viewport().width, viewport().height]])
      .scaleExtent([1, 64])
      .on('start', () => {
        cancelAnimationFrame(endZoomFrame)
        setDragging(true)
      })
      .on('zoom', (event: D3ZoomEvent<HTMLElement, unknown>) => {
        pendingTransform = event.transform
        if (zoomFrame) return
        zoomFrame = requestAnimationFrame(() => {
          zoomFrame = 0
          setTransform(pendingTransform)
        })
      })
      .on('end', () => {
        // Paint the final zoom layout before restoring data-update transitions.
        endZoomFrame = requestAnimationFrame(() => {
          endZoomFrame = requestAnimationFrame(() => {
            endZoomFrame = 0
            setDragging(false)
          })
        })
      })
    surface.call(navigation)

    const handleResize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      setViewport({ width, height })
      navigation.translateExtent([[0, 0], [width, height]])
      surface.call(navigation.scaleBy, 1)
    }
    window.addEventListener('resize', handleResize)
    const controller = new AbortController()
    let loading = false

    const load = async () => {
      if (loading) return
      loading = true
      try {
        const response = await fetch(WIFI_URL, {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) throw new Error(`Wi-Fi API: ${response.status}`)
        const next = await response.json() as WifiSnapshot
        if (controller.signal.aborted) return
        setSnapshot(next)
        setError(false)
      } catch {
        if (!controller.signal.aborted) setError(true)
      } finally {
        loading = false
      }
    }

    let lastBucket = refreshBucket(Date.now())
    void load()

    let refreshTimer = 0
    const scheduleRefresh = () => {
      const delay = REFRESH_MS - (Date.now() % REFRESH_MS) + 1000
      refreshTimer = window.setTimeout(() => {
        const bucket = refreshBucket(Date.now())
        if (bucket !== lastBucket) {
          lastBucket = bucket
          void load()
        }
        scheduleRefresh()
      }, delay)
    }
    scheduleRefresh()

    onCleanup(() => {
      cancelAnimationFrame(zoomFrame)
      cancelAnimationFrame(endZoomFrame)
      surface.on('.zoom', null)
      controller.abort()
      window.clearTimeout(refreshTimer)
      window.removeEventListener('resize', handleResize)
    })
  })

  return (
    <main
      ref={container}
      class="fixed inset-0 touch-none overflow-hidden bg-[#0a0c0f] text-white select-none"
      classList={{ 'cursor-grab': !dragging(), 'cursor-grabbing': dragging() }}
      aria-label="棟・階・AP別のWi-Fi接続端末数"
    >
      <div
        class="treemap-scene absolute inset-0"
        classList={{ 'is-zooming': dragging() }}
        style={{
          transform: `translate(${transform().x}px, ${transform().y}px)`,
          '--label-padding': `${LABEL_PADDING}px`,
        }}
      >
        <For each={nodeIds()}>
          {(id) => {
            const node = () => nodes().get(id)!
            const isAp = createMemo(() => node().data.kind === 'ap')
            const clients = createMemo(() => node().data.clients)
            const width = () => node().x1 - node().x0
            const height = () => node().y1 - node().y0
            const name = createMemo(() => {
              const data = node().data
              if (data.kind !== 'building') return data.name
              return data.name === 'unknown' ? 'TBD' : data.name.charAt(0).toUpperCase() + data.name.slice(1)
            })
            const title = () => `${node().ancestors().reverse().slice(1).map((part) => part.data.name).join(' / ')} · ${node().value}`
            const header = createMemo(() => `${name()} · ${node().value}`)
            const textWidth = createMemo(() => {
              measurement.font = `600 ${LABEL_MAX_SIZE}px ${fontFamily()}`
              const nameWidth = measurement.measureText(isAp() ? name() : header()).width
              measurement.font = `400 ${LABEL_MAX_SIZE}px ${fontFamily()}`
              const countWidth = measurement.measureText(String(clients())).width
              return isAp() ? Math.max(nameWidth, countWidth) : nameWidth
            })
            const visible = createMemo(() => {
              const { x, y } = transform()
              const current = node()
              return current.x1 + x > 0 && current.x0 + x < viewport().width
                && current.y1 + y > 0 && current.y0 + y < viewport().height
            })
            const headerHeight = () => (node().children?.[0]?.y0 ?? node().y0) - node().y0 - TREEMAP_PADDING
            const fontSize = createMemo(() => {
              if (!visible()) return 0
              if (!isAp()) return headerHeight() >= HEADER_SIZE && width() > 8 ? HEADER_SIZE : 0
              const availableWidth = width() - LABEL_PADDING * 2
              const availableHeight = height() - LABEL_PADDING * 2
              const lineHeight = 2.3
              if (availableWidth <= 0 || availableHeight < LABEL_MIN_SIZE * lineHeight) return 0
              // Use whole screen pixels so DOM styles change only when the size does.
              return Math.max(LABEL_MIN_SIZE, Math.floor(Math.min(
                LABEL_MAX_SIZE,
                0.85 * availableWidth * LABEL_MAX_SIZE / textWidth(),
                availableHeight / lineHeight,
              )))
            })

            return (
              <div
                class="treemap-cell cell-transition absolute overflow-hidden"
                classList={{ 'flex items-center justify-center': isAp() }}
                title={title()}
                role={isAp() ? 'img' : undefined}
                aria-label={isAp() ? title() : undefined}
                style={{
                  left: `${node().x0}px`, top: `${node().y0}px`,
                  width: `${width()}px`, height: `${height()}px`,
                  'background-color': isAp()
                    ? `hsl(${130 * (1 - Math.min(node().data.clients, RED_CLIENTS) / RED_CLIENTS)} 68% 41%)`
                    : node().depth === 1 ? '#1d232b' : '#303741',
                }}
              >
                <Show when={fontSize()}>
                  {(size) => (
                    <div
                      class="treemap-label w-full"
                      classList={{ 'text-center leading-[1.15]': isAp(), 'flex items-center leading-none': !isAp() }}
                      style={{
                        '--label-size': `${size()}px`,
                        height: isAp() ? undefined : `${headerHeight() + TREEMAP_PADDING}px`,
                      }}
                    >
                      <div class="truncate font-semibold">{isAp() ? name() : header()}</div>
                      <Show when={isAp()}>
                        <div class="truncate opacity-85">{node().data.clients}</div>
                      </Show>
                    </div>
                  )}
                </Show>
              </div>
            )
          }}
        </For>
      </div>
      <Show when={!snapshot() || snapshot()?.clients.length === 0}>
        <p class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground" role="status">
          {error() ? 'Wi-Fi接続情報を取得できませんでした。' : snapshot() ? '接続中の端末はありません。' : 'Wi-Fi接続情報を読み込み中…'}
        </p>
      </Show>
      <Show when={snapshot()}>
        {(value) => (
          <div class="pointer-events-none fixed right-2 bottom-2 rounded bg-background/85 px-2 py-1 text-xs text-foreground" role="status">
            {TIME_FORMATTER.format(new Date(value().measuredAt))} · {value().clients.length}
            {error() ? ' · 更新に失敗（前回の観測を表示）' : ''}
          </div>
        )}
      </Show>
    </main>
  )
}
