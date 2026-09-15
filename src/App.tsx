import { Index, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import CrowdTimeRangeSlider, {
  maxSelectableIndex,
  sliderStep,
} from '@/components/crowd-time-range-slider'
import { squarify, type TreemapRect } from './treemap'

const STREAM_URL = '/api/crowd/stream'
const RANGE_URL = '/api/crowd/range'
const RANGE_DOMAIN_MS = 24 * 60 * 60 * 1000
const RANGE_REFRESH_MS = 5 * 60 * 1000
const RANGE_ALIGN_MS = 5 * 60 * 1000
const DEFAULT_WINDOW_MINUTES = 60

const BUILDING_KEYS = [
  'alpha',
  'delta',
  'epsilon',
  'iota',
  'kappa',
  'lambda',
  'lounge',
  'mu',
  'omega',
  'omicron',
  'pe-buildings',
  'sigma',
  'tau',
  'theta',
]

const BUILDING_NAMES: Record<string, string> = {
  alpha: 'Alpha',
  delta: 'Delta',
  epsilon: 'Epsilon',
  iota: 'Iota',
  kappa: 'Kappa',
  lambda: 'Lambda',
  lounge: 'Lounge',
  mu: 'Mu',
  omega: 'Omega',
  omicron: 'Omicron',
  'pe-buildings': 'PE Buildings',
  sigma: 'Sigma',
  tau: 'Tau',
  theta: 'Theta',
}

interface Reading {
  buildingKey: string
  crowdLevel: number | null
  apClientCount: number | null
}

interface Snapshot {
  readings?: Reading[]
}

interface RangeReading {
  buildingKey: string
  crowdLevels?: (number | null)[]
  apClientCounts?: (number | null)[]
}

interface RangeResponse {
  startTime?: string
  endTime?: string
  readings?: RangeReading[]
}

interface BuildingSeries {
  levels: (number | null)[]
  counts: (number | null)[]
}

interface RangeSeries {
  startTimeMs: number
  intervalMs: number
  pointCount: number
  buildings: Map<string, BuildingSeries>
}

interface Viewport {
  width: number
  height: number
}

interface CellProps {
  buildingKey: string
  rect: () => TreemapRect<string> | undefined
  reading: () => Reading | undefined
}

async function fetchRange(startMs: number, endMs: number): Promise<RangeSeries | null> {
  const query = new URLSearchParams({
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
  })
  const response = await fetch(`${RANGE_URL}?${query}`)
  if (!response.ok) return null
  const data = (await response.json()) as RangeResponse
  const list = data.readings
  if (!Array.isArray(list) || list.length === 0 || !data.startTime || !data.endTime) return null
  const pointCount = list[0].crowdLevels?.length ?? 0
  if (pointCount === 0) return null
  const startTimeMs = Date.parse(data.startTime)
  const endTimeMs = Date.parse(data.endTime)
  const intervalMs = (endTimeMs - startTimeMs) / pointCount
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null
  const buildings = new Map<string, BuildingSeries>()
  for (const reading of list) {
    buildings.set(reading.buildingKey, {
      levels: reading.crowdLevels ?? [],
      counts: reading.apClientCounts ?? [],
    })
  }
  return { startTimeMs, intervalMs, pointCount, buildings }
}

function totalPoints(series: RangeSeries): number {
  return series.pointCount + 1
}

function lastSelectableIndex(series: RangeSeries): number {
  return maxSelectableIndex(totalPoints(series), sliderStep(series.intervalMs))
}

function aggregateRange(
  series: RangeSeries,
  start: number,
  end: number,
  live: Map<string, Reading>,
): Map<string, Reading> {
  const result = new Map<string, Reading>()
  const buildingKeys = new Set<string>([...series.buildings.keys(), ...live.keys()])
  for (const buildingKey of buildingKeys) {
    const building = series.buildings.get(buildingKey)
    let levelSum = 0
    let levelCount = 0
    let clientSum = 0
    let clientCount = 0
    for (let index = start; index <= end; index += 1) {
      if (building && index < series.pointCount) {
        const level = building.levels[index]
        if (level != null) {
          levelSum += level
          levelCount += 1
        }
        const clients = building.counts[index]
        if (clients != null) {
          clientSum += clients
          clientCount += 1
        }
        continue
      }
      const reading = live.get(buildingKey)
      if (!reading) continue
      if (reading.crowdLevel != null) {
        levelSum += reading.crowdLevel
        levelCount += 1
      }
      if (reading.apClientCount != null) {
        clientSum += reading.apClientCount
        clientCount += 1
      }
    }
    result.set(buildingKey, {
      buildingKey,
      crowdLevel: levelCount === 0 ? null : Math.round(levelSum / levelCount),
      apClientCount: clientCount === 0 ? null : Math.round(clientSum / clientCount),
    })
  }
  return result
}

function displayName(key: string): string {
  return BUILDING_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' ')
}

function levelColor(level: number | null | undefined): string {
  if (level == null) return 'hsl(215 10% 26%)'
  const ratio = Math.min(Math.max(level, 0), 100) / 100
  return `hsl(${(1 - ratio) * 130} 68% 41%)`
}

function statsText(reading: Reading | undefined): string {
  if (!reading) return ''
  const level = reading.crowdLevel == null ? '–' : `${reading.crowdLevel}%`
  const count = reading.apClientCount == null ? '–' : `${reading.apClientCount}`
  return `${level} · ${count}`
}

function longestWord(value: string): string {
  let longest = ''
  for (const word of value.split(/\s+/)) {
    if (word.length > longest.length) longest = word
  }
  return longest
}

function textMetrics(rect: TreemapRect<string>, name: string, stats: string) {
  const width = rect.width - 12
  const height = rect.height - 12
  if (width <= 0 || height <= 0) return null
  const ideal = Math.sqrt(rect.width * rect.height) * 0.15
  const nameFit = width / (longestWord(name).length * 0.62)
  const nameSize = Math.max(Math.min(ideal, 64, nameFit, (height - 2) / 1.7825), 8)
  const statsSize =
    stats.length === 0
      ? 0
      : Math.max(
          Math.min(nameSize * 0.55, width / (stats.length * 0.62), (height - nameSize * 1.15 - 2) / 1.15),
          8,
        )
  return { nameSize, statsSize }
}

function Cell(props: CellProps) {
  const name = () => displayName(props.buildingKey)
  const stats = () => statsText(props.reading())

  const metrics = createMemo(() => {
    const rect = props.rect()
    if (!rect || rect.width < 12 || rect.height < 10) return null
    const value = textMetrics(rect, name(), stats())
    return value ? { rect, ...value } : null
  })

  const cellStyle = () => {
    const value = metrics()
    if (!value) return { display: 'none' }
    const { rect } = value
    return {
      display: 'flex',
      left: `${rect.x + 2}px`,
      top: `${rect.y + 2}px`,
      width: `${Math.max(rect.width - 4, 0)}px`,
      height: `${Math.max(rect.height - 4, 0)}px`,
      'background-color': levelColor(props.reading()?.crowdLevel),
    }
  }

  return (
    <div
      class="cell-transition absolute flex items-center justify-center overflow-hidden rounded-[4px] p-1 text-white"
      style={cellStyle()}
    >
      <Show when={metrics()}>
        {(value) => (
          <div class="flex max-h-full w-full flex-col items-center justify-center gap-[0.15em] text-center leading-[1.15]">
            <span
              class="min-h-0 max-w-full overflow-hidden font-semibold tracking-[0.01em] [overflow-wrap:anywhere] [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]"
              style={{ 'font-size': `${value().nameSize}px` }}
            >
              {name()}
            </span>
            <Show when={stats()}>
              <span
                class="max-w-full flex-none overflow-hidden tabular-nums whitespace-nowrap opacity-85 [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]"
                style={{ 'font-size': `${value().statsSize}px` }}
              >
                {stats()}
              </span>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}

export default function App() {
  const [liveReadings, setLiveReadings] = createSignal<Map<string, Reading>>(new Map())
  const [series, setSeries] = createSignal<RangeSeries | null>(null)
  const [selection, setSelection] = createSignal<[number, number]>([0, 0])
  const [keys, setKeys] = createSignal<string[]>(BUILDING_KEYS)
  const [viewport, setViewport] = createSignal<Viewport>({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  const readings = createMemo(() => {
    const value = series()
    if (!value) return liveReadings()
    const [start, end] = selection()
    return aggregateRange(value, start, end, liveReadings())
  })

  const activity = createMemo(() => {
    const value = series()
    if (!value) return []
    const totals = new Array<number>(totalPoints(value)).fill(0)
    for (const building of value.buildings.values()) {
      for (let index = 0; index < value.pointCount; index += 1) {
        const clients = building.counts[index]
        if (clients != null) totals[index] += clients
      }
    }
    let liveTotal = 0
    for (const reading of liveReadings().values()) {
      if (reading.apClientCount != null) liveTotal += reading.apClientCount
    }
    totals[value.pointCount] = liveTotal
    return totals
  })

  const layout = createMemo(() => {
    const { width, height } = viewport()
    const current = readings()
    const items = keys().map((key) => ({
      value: Math.max(current.get(key)?.apClientCount ?? 0, 1),
      data: key,
    }))
    return new Map(squarify(items, width, height).map((rect) => [rect.data, rect]))
  })

  onMount(() => {
    const handleResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', handleResize)

    const source = new EventSource(STREAM_URL)
    const handleMessage = (event: Event) => {
      let snapshot: Snapshot
      try {
        snapshot = JSON.parse((event as MessageEvent<string>).data) as Snapshot
      } catch {
        return
      }
      const list = snapshot.readings
      if (!Array.isArray(list)) return
      const next = new Map<string, Reading>()
      for (const reading of list) next.set(reading.buildingKey, reading)
      setLiveReadings(next)
      setKeys((prev) => {
        const added = list.filter((reading) => !prev.includes(reading.buildingKey))
        return added.length === 0 ? prev : [...prev, ...added.map((reading) => reading.buildingKey)]
      })
    }
    source.addEventListener('building-crowd-snapshot', handleMessage)
    source.addEventListener('message', handleMessage)

    let disposed = false
    const loadRange = async () => {
      const endMs = Math.floor(Date.now() / RANGE_ALIGN_MS) * RANGE_ALIGN_MS
      const next = await fetchRange(endMs - RANGE_DOMAIN_MS, endMs)
      if (!next || disposed) return
      const previous = series()
      const [previousStart, previousEnd] = selection()
      setSeries(next)
      setKeys((prev) => {
        const added = [...next.buildings.keys()].filter((key) => !prev.includes(key))
        return added.length === 0 ? prev : [...prev, ...added]
      })
      const step = sliderStep(next.intervalMs)
      const lastIndex = maxSelectableIndex(totalPoints(next), step)
      if (!previous) {
        const windowPoints = Math.round((DEFAULT_WINDOW_MINUTES * 60_000) / next.intervalMs)
        const start = Math.max(lastIndex - windowPoints, 0)
        setSelection([start - (start % step), lastIndex])
        return
      }
      if (previousEnd >= lastSelectableIndex(previous)) {
        const windowLength = previousEnd - previousStart
        const start = Math.max(lastIndex - windowLength, 0)
        setSelection([start - (start % step), lastIndex])
        return
      }
      const startTimeMs = previous.startTimeMs + previousStart * previous.intervalMs
      const endTimeMs = previous.startTimeMs + previousEnd * previous.intervalMs
      const toIndex = (timeMs: number) => {
        const snapped = Math.round((timeMs - next.startTimeMs) / next.intervalMs / step) * step
        return Math.min(Math.max(snapped, 0), lastIndex)
      }
      const start = toIndex(startTimeMs)
      setSelection([start, Math.max(toIndex(endTimeMs), start)])
    }
    void loadRange()
    const refreshTimer = window.setInterval(() => void loadRange(), RANGE_REFRESH_MS)

    onCleanup(() => {
      disposed = true
      window.clearInterval(refreshTimer)
      window.removeEventListener('resize', handleResize)
      source.close()
    })
  })

  return (
    <div class="fixed inset-0 overflow-hidden bg-[#0a0c0f]">
      <Index each={keys()}>
        {(key) => {
          const rect = createMemo(() => layout().get(key()))
          const reading = createMemo(() => readings().get(key()))
          return <Cell buildingKey={key()} rect={rect} reading={reading} />
        }}
      </Index>
      <Show when={series()}>
        {(value) => (
          <CrowdTimeRangeSlider
            startTimeMs={value().startTimeMs}
            intervalMs={value().intervalMs}
            pointCount={totalPoints(value())}
            activity={activity()}
            value={selection()}
            onChange={setSelection}
          />
        )}
      </Show>
    </div>
  )
}
