export interface TreemapItem<T> {
  value: number
  data: T
}

export interface TreemapRect<T> {
  x: number
  y: number
  width: number
  height: number
  value: number
  data: T
}

function sum(values: number[]): number {
  let total = 0
  for (const value of values) total += value
  return total
}

function worstAspect(areas: number[], length: number): number {
  let total = 0
  let max = 0
  let min = Number.POSITIVE_INFINITY
  for (const area of areas) {
    total += area
    if (area > max) max = area
    if (area < min) min = area
  }
  const totalSquared = total * total
  const lengthSquared = length * length
  return Math.max((lengthSquared * max) / totalSquared, totalSquared / (lengthSquared * min))
}

function layoutRow<T>(
  items: TreemapItem<T>[],
  areas: number[],
  x: number,
  y: number,
  width: number,
  height: number,
  out: TreemapRect<T>[],
): void {
  if (items.length === 0 || width <= 0 || height <= 0) return

  const vertical = width >= height
  const length = vertical ? height : width
  let count = 1
  let best = worstAspect([areas[0]], length)
  while (count < areas.length) {
    const candidate = worstAspect(areas.slice(0, count + 1), length)
    if (candidate > best) break
    best = candidate
    count += 1
  }

  const rowTotal = sum(areas.slice(0, count))
  if (vertical) {
    const rowWidth = rowTotal / height
    let offset = y
    for (let i = 0; i < count; i += 1) {
      const cellHeight = areas[i] / rowWidth
      out.push({
        x,
        y: offset,
        width: rowWidth,
        height: cellHeight,
        value: items[i].value,
        data: items[i].data,
      })
      offset += cellHeight
    }
    layoutRow(items.slice(count), areas.slice(count), x + rowWidth, y, width - rowWidth, height, out)
  } else {
    const rowHeight = rowTotal / width
    let offset = x
    for (let i = 0; i < count; i += 1) {
      const cellWidth = areas[i] / rowHeight
      out.push({
        x: offset,
        y,
        width: cellWidth,
        height: rowHeight,
        value: items[i].value,
        data: items[i].data,
      })
      offset += cellWidth
    }
    layoutRow(items.slice(count), areas.slice(count), x, y + rowHeight, width, height - rowHeight, out)
  }
}

export function squarify<T>(items: TreemapItem<T>[], width: number, height: number): TreemapRect<T>[] {
  const positive = items.filter((item) => item.value > 0)
  if (positive.length === 0 || width <= 0 || height <= 0) return []

  const sorted = [...positive].sort((a, b) => b.value - a.value)
  const total = sum(sorted.map((item) => item.value))
  const scale = (width * height) / total
  const areas = sorted.map((item) => item.value * scale)
  const out: TreemapRect<T>[] = []
  layoutRow(sorted, areas, 0, 0, width, height, out)
  return out
}
