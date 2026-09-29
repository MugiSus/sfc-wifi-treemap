import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

let api;
before(async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL('./wifi-entry.ts', import.meta.url)),
        formats: ['es'],
      },
    },
  });
  const output = (Array.isArray(result) ? result : [result])
    .flatMap((bundle) => bundle.output)
    .find((item) => item.type === 'chunk' && item.isEntry);
  api = await import(
    `data:text/javascript;base64,${Buffer.from(output.code).toString('base64')}`
  );
});

const time = '2026-09-28T17:50:01.529Z';
const client = (accessPointName, flags = {}) => ({
  accessPointName,
  autoExcluded: false,
  blacklisted: false,
  ...flags,
});
const clients = [
  client('ap-kappa-1f-01', { buildingKey: 'kappa' }),
  client('ap-kappa-1f-01', { buildingKey: 'kappa' }),
  client('ap-kappa-1f-02', { buildingKey: 'kappa' }),
  client('ap-kappa-2f-01', { buildingKey: 'kappa', autoExcluded: true }),
  client('ap-kappa-1f-02', { buildingKey: 'kappa', blacklisted: true }),
  client('ap-kappa-1f-01', {
    buildingKey: 'kappa',
    autoExcluded: true,
    blacklisted: true,
  }),
  client('delta-2f-room', { buildingKey: 'delta' }),
  client('ap-unassigned'),
];
const snapshot = {
  measuredAt: time,
  clients,
  totalClientCount: 8,
  excludedClientCount: 3,
  clientCount: 5,
};

function mockResponse(t, body = snapshot, status = 200) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return Response.json(body, { status });
  });
  return calls;
}

test('uses upstream exclusion flags once and retains APs without area assignments', async (t) => {
  const calls = mockResponse(t);
  const signal = new AbortController().signal;
  const result = await api.loadWifiSnapshot(signal);
  assert.deepEqual(result, {
    measuredAt: time,
    clients: [clients[0], clients[1], clients[2], clients[6], clients[7]],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/wifi/clients/list');
  assert.equal(calls[0].options.signal, signal);
  assert.equal(calls[0].options.cache, 'no-store');
});

test('keeps campus → building → floor → AP hierarchy and separate AP counts within the same floor', async (t) => {
  mockResponse(t);
  const result = await api.loadWifiSnapshot(new AbortController().signal);
  const data = api.buildAccessPointData(result.clients);
  const hierarchy = api.buildTreemapHierarchy(data);
  const ap = data.find((node) => node.name === 'ap-kappa-1f-01');
  assert.equal(hierarchy.value, 5);
  assert.equal(ap.value, 2);
  const byId = new Map(data.map((node) => [node.id, node]));
  const ancestors = [];
  for (let node = ap; node; node = byId.get(node.parentId)) {
    ancestors.unshift(node.name);
  }
  assert.deepEqual(ancestors, ['SFC', 'kappa', '1f', 'ap-kappa-1f-01']);
  const floor = hierarchy.descendants().find((node) => node.id === ap.parentId);
  assert.equal(floor.value, 3);
  assert.equal(floor.children.length, 2);
  assert.equal(
    byId.get(data.find((node) => node.name === 'delta-2f-room').parentId).name,
    '2f',
  );
  assert.equal(
    byId.get(
      byId.get(data.find((node) => node.name === 'ap-unassigned').parentId)
        .parentId,
    ).name,
    'unknown',
  );
});

test('keeps the frame around one positive item and omits zero-total branches', () => {
  const data = [
    { id: 'root', name: 'Campus' },
    { id: 'building', parentId: 'root', name: 'Building' },
    { id: 'floor', parentId: 'building', name: 'Floor' },
    { id: 'item', parentId: 'floor', name: 'Item', value: 1 },
    { id: 'empty-building', parentId: 'root', name: 'Empty' },
    {
      id: 'empty-item',
      parentId: 'empty-building',
      name: 'Empty item',
      value: 0,
    },
  ];
  const nodes = api
    .createTreemapLayout()
    .size([800, 600])(api.buildTreemapHierarchy(data))
    .descendants();
  assert.deepEqual(
    nodes.map((node) => node.id),
    ['root', 'building', 'floor', 'item'],
  );
  for (const node of nodes.slice(1)) {
    assert.ok(node.x1 > node.x0, `${node.id} has width`);
    assert.ok(node.y1 > node.y0, `${node.id} has height`);
  }
  const rootOnly = api.buildTreemapHierarchy([
    { id: 'only', name: 'Only item', value: 1 },
  ]);
  assert.deepEqual(
    rootOnly.descendants().map((node) => node.id),
    ['only'],
  );
  const zeroOnly = api.buildTreemapHierarchy([
    { id: 'root', name: 'Campus' },
    { id: 'empty', parentId: 'root', name: 'Empty', value: 0 },
  ]);
  assert.equal(zeroOnly.value, 0);
  assert.deepEqual(
    zeroOnly.descendants().map((node) => node.id),
    ['root'],
  );
});

test('rejects missing or malformed exclusion flags and invalid snapshots', async (t) => {
  for (const body of [
    { measuredAt: time, clients: [{ accessPointName: 'ap-kappa-1f-01' }] },
    {
      measuredAt: time,
      clients: [client('ap-kappa-1f-01', { autoExcluded: 'false' })],
    },
    {
      measuredAt: time,
      clients: [client('ap-kappa-1f-01', { blacklisted: null })],
    },
    { ...snapshot, measuredAt: 'invalid' },
  ]) {
    mockResponse(t, body);
    await assert.rejects(
      api.loadWifiSnapshot(new AbortController().signal),
      /Invalid Wi-Fi/,
    );
    t.mock.restoreAll();
  }
});

test('allows successful empty observations, and rejects upstream failures', async (t) => {
  mockResponse(t, { measuredAt: time, clients: [] });
  const result = await api.loadWifiSnapshot(new AbortController().signal);
  assert.deepEqual(result.clients, []);
  assert.deepEqual(api.buildAccessPointData(result.clients), []);
  for (const node of api
    .createTreemapLayout()
    .size([800, 600])(
      api.buildTreemapHierarchy(api.buildAccessPointData(result.clients)),
    )
    .descendants()) {
    for (const coordinate of [node.x0, node.y0, node.x1, node.y1])
      assert.equal(Number.isFinite(coordinate), true);
  }
  t.mock.restoreAll();
  mockResponse(t, { error: 'unavailable' }, 503);
  await assert.rejects(
    api.loadWifiSnapshot(new AbortController().signal),
    /503/,
  );
});
