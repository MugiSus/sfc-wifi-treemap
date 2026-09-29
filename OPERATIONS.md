# Crowd floor treemap and per-AP snapshots

The frontend reads `/api/crowd?groupBy=floor` to obtain all registered floor counts in one request. It also reads `/api/areas` to validate the returned floors and building membership. The existing development and production proxies forward these paths to `https://api.dtc.wide.ad.jp/crowd?groupBy=floor` and `/areas`.

The treemap shows building → floor, using `clientCount` for tile area, color, and the footer total. This is the upstream device count after exclusions, not an estimated people count. The app does not subtract `excludedClientCount` or the local 03:00 AP-count baseline again. It preserves the D3 zoom, pan, pinch, fixed spacing, and five-minute refresh schedule. Floor leaf labels use the exact `areaKey` returned by `/crowd`, such as `iota-1f`, `alpha-bf`, `mu-b1`, and `sigma-rf`, without parsing or shortening.

With `groupBy=floor`, buildings without registered floors (currently `delta` and `pe-buildings`) are omitted by the API. The displayed total covers the returned floors only. Building totals and east/west areas are not added, avoiding double counting. AP-level tiles are no longer shown.

The request omits `time` to use the latest fully processed observation. The footer shows `measuredAt`, with a processing indicator when `processingPending` is true. A zero count is a valid empty observation; a `null` count is missing data and has no tile area. Missing floors are reported in the footer, whose numeric value is the known subtotal; affected building headers also indicate missing data. Invalid responses, missing floor records, and failed requests retain the previous snapshot and show the existing failed-update message.

API reference: https://api.dtc.wide.ad.jp/#tag/crowd (OpenAPI: https://api.dtc.wide.ad.jp/doc).

## Existing per-AP collector

The Worker still runs its existing scheduled job at 03:00 JST. It groups all connected clients by `(buildingKey, accessPointName)` and stores per-AP counts as TOML in a private Cloudflare KV namespace. `/api/wifi/ap-counts/latest.toml` remains available, but is not used by this frontend.

The per-AP collector still uses `/wifi/clients/list` because `/crowd` has no AP-level breakdown. Its schedule, KV records, and TOML endpoint are independent of the frontend's data source.

## Cloudflare setup

Create a KV namespace:

```sh
pnpm exec wrangler kv namespace create WIFI_STATE
```

Set the returned namespace ID in `wrangler.jsonc`, then deploy:

```sh
pnpm deploy
```

The only configured Cron Trigger is `0 18 * * *` UTC (03:00 JST). Cloudflare cron schedules use UTC. A newly added or changed trigger can take several minutes to propagate.

## Snapshot behavior

- A successful run writes a dated TOML record with a 90-day TTL and updates the latest snapshot.
- `measured_at` is the observation time supplied by the API; it may differ from the scheduled time.
- The collector refuses an observation whose JST date differs from the scheduled date. On an upstream error, invalid response, or stale observation, it leaves the last valid snapshot unchanged.
- The source API lists connected clients, so APs with zero connected clients are absent from the snapshot.
- The regular `/api/wifi/clients/list` proxy passes the upstream response through without filtering client IDs.

The TOML format is:

```toml
format_version = 1
measured_at = "2026-09-27T03:00:00.000Z"

[[access_points]]
name = "ap-kappa-1f-east"
building_key = "kappa"
client_count = 12
```

The API returns top-level `measuredAt` and a `clients` array containing `accessPointName`, optional `buildingKey`, and other client fields. The collector only uses the AP name and building key to count records. The API may return its latest processed observation while a newer snapshot is still pending; inspect `measuredAt` and Worker logs when validating the scheduled run.
