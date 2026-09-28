import type { TreemapDatum } from './components/hierarchy-treemap/layout';

import type { WifiClient } from './types/wifi';

export type { WifiClient, WifiSnapshot } from './types/wifi';

interface AccessPointNode {
  id: string;
  parentId: string | undefined;
  name: string;
  kind: 'campus' | 'building' | 'floor' | 'ap';
  clients: number;
}

export function buildAccessPointData(clients: WifiClient[]): TreemapDatum[] {
  const nodes = new Map<string, AccessPointNode>();
  nodes.set('campus', {
    id: 'campus',
    parentId: undefined,
    name: 'SFC',
    kind: 'campus',
    clients: 0,
  });

  for (const client of clients) {
    const name = client.accessPointName;
    const apLocation = /^ap-(.+?)-(\d+f|b\d+|bf|rf)(?:-|$)/.exec(name);
    const deltaLocation = /^delta-(\d+f|b\d+|bf|rf)(?:-|$)/.exec(name);
    const building =
      client.buildingKey ??
      apLocation?.[1] ??
      (deltaLocation ? 'delta' : 'unknown');
    const floor = apLocation?.[2] ?? deltaLocation?.[1] ?? 'TBD';
    const buildingId = JSON.stringify([building]);
    const floorId = JSON.stringify([building, floor]);
    const apId = JSON.stringify([building, floor, name]);

    if (!nodes.has(buildingId)) {
      nodes.set(buildingId, {
        id: buildingId,
        parentId: 'campus',
        name: building,
        kind: 'building',
        clients: 0,
      });
    }
    if (!nodes.has(floorId)) {
      nodes.set(floorId, {
        id: floorId,
        parentId: buildingId,
        name: floor,
        kind: 'floor',
        clients: 0,
      });
    }
    const ap = nodes.get(apId);
    if (ap) {
      ap.clients += 1;
    } else {
      nodes.set(apId, {
        id: apId,
        parentId: floorId,
        name,
        kind: 'ap',
        clients: 1,
      });
    }
  }

  return [...nodes.values()].map((node) => ({
    id: node.id,
    parentId: node.parentId,
    name: node.name,
    label:
      node.kind === 'building'
        ? node.name === 'unknown'
          ? 'TBD'
          : node.name.charAt(0).toUpperCase() + node.name.slice(1)
        : undefined,
    value: node.clients,
    color:
      node.kind === 'ap'
        ? `hsl(${130 * (1 - Math.min(node.clients, 80) / 80)} 68% 41%)`
        : undefined,
  }));
}
