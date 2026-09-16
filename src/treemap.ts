import { stratify, treemap, treemapResquarify } from 'd3-hierarchy'

export interface WifiClient {
  accessPointName: string
  buildingKey?: string
}

export interface WifiSnapshot {
  measuredAt: string
  clients: WifiClient[]
}

export interface AccessPointNode {
  id: string
  parentId: string | undefined
  name: string
  kind: 'campus' | 'building' | 'floor' | 'ap'
  clients: number
}

export function buildAccessPointHierarchy(clients: WifiClient[]) {
  const nodes = new Map<string, AccessPointNode>()
  nodes.set('campus', {
    id: 'campus', parentId: undefined, name: 'SFC', kind: 'campus', clients: 0,
  })

  for (const client of clients) {
    const name = client.accessPointName
    const apLocation = /^ap-(.+?)-(\d+f|b\d+|bf|rf)(?:-|$)/.exec(name)
    const deltaLocation = /^delta-(\d+f|b\d+|bf|rf)(?:-|$)/.exec(name)
    const building = client.buildingKey ?? apLocation?.[1] ?? (deltaLocation ? 'delta' : 'unknown')
    const floor = apLocation?.[2] ?? deltaLocation?.[1] ?? 'TBD'
    const buildingId = JSON.stringify([building])
    const floorId = JSON.stringify([building, floor])
    const apId = JSON.stringify([building, floor, name])

    if (!nodes.has(buildingId)) {
      nodes.set(buildingId, {
        id: buildingId, parentId: 'campus', name: building, kind: 'building', clients: 0,
      })
    }
    if (!nodes.has(floorId)) {
      nodes.set(floorId, {
        id: floorId, parentId: buildingId, name: floor, kind: 'floor', clients: 0,
      })
    }
    const ap = nodes.get(apId)
    if (ap) {
      ap.clients += 1
    } else {
      nodes.set(apId, {
        id: apId, parentId: floorId, name, kind: 'ap', clients: 1,
      })
    }
  }

  return stratify<AccessPointNode>()([...nodes.values()])
    .sum((node) => node.clients)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.id!.localeCompare(b.id!))
}

export const BUILDING_HEADER_HEIGHT = 20
export const FLOOR_HEADER_HEIGHT = 16
export const TREEMAP_PADDING = 3
const TREEMAP_GAP = 2

// Lay out in screen pixels so rounding never gets magnified by CSS scaling.
export const layoutAccessPoints = treemap<AccessPointNode>()
  .tile(treemapResquarify)
  .round(true)
  .paddingInner(TREEMAP_GAP)
  .paddingOuter(TREEMAP_PADDING)
  .paddingTop((node) => {
    if (node.depth === 0 || node.x1 - node.x0 < 40 || node.y1 - node.y0 < 48) return TREEMAP_PADDING
    return node.depth === 1 ? BUILDING_HEADER_HEIGHT : FLOOR_HEADER_HEIGHT
  })
