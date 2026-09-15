import { Index, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { squarify, type TreemapRect } from './treemap'

const STREAM_URL = '/api/crowd/stream'

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

interface Viewport {
  width: number
  height: number
}

interface CellProps {
  buildingKey: string
  rect: () => TreemapRect<string> | undefined
  reading: () => Reading | undefined
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

function Cell(props: CellProps) {
  const name = () => displayName(props.buildingKey)

  const metrics = createMemo(() => {
    const rect = props.rect()
    if (!rect || rect.width < 28 || rect.height < 14) return null
    const ideal = Math.sqrt(rect.width * rect.height) * 0.15
    const fit = rect.width / (name().length * 0.62)
    const nameSize = Math.max(Math.min(ideal, 64, fit), 9)
    return {
      rect,
      nameSize,
      statsSize: Math.max(nameSize * 0.55, 10),
      showStats: rect.width >= 96 && rect.height >= 48,
    }
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
    <div class="cell" style={cellStyle()}>
      <Show when={metrics()}>
        {(value) => (
          <div class="cell-label">
            <span class="cell-name" style={{ 'font-size': `${value().nameSize}px` }}>
              {name()}
            </span>
            <Show when={value().showStats && props.reading()}>
              <span class="cell-stats" style={{ 'font-size': `${value().statsSize}px` }}>
                {statsText(props.reading())}
              </span>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}

export default function App() {
  const [readings, setReadings] = createSignal<Map<string, Reading>>(new Map())
  const [keys, setKeys] = createSignal<string[]>(BUILDING_KEYS)
  const [viewport, setViewport] = createSignal<Viewport>({
    width: window.innerWidth,
    height: window.innerHeight,
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
      setReadings(next)
      setKeys((prev) => {
        const added = list.filter((reading) => !prev.includes(reading.buildingKey))
        return added.length === 0 ? prev : [...prev, ...added.map((reading) => reading.buildingKey)]
      })
    }
    source.addEventListener('building-crowd-snapshot', handleMessage)
    source.addEventListener('message', handleMessage)

    onCleanup(() => {
      window.removeEventListener('resize', handleResize)
      source.close()
    })
  })

  return (
    <div class="treemap">
      <Index each={keys()}>
        {(key) => {
          const rect = createMemo(() => layout().get(key()))
          const reading = createMemo(() => readings().get(key()))
          return <Cell buildingKey={key()} rect={rect} reading={reading} />
        }}
      </Index>
    </div>
  )
}
