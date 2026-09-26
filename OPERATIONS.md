# Per-AP connected-client count snapshot

The Worker runs one scheduled job at 03:00 JST. It reads the Wi-Fi clients API, groups connected clients by `(buildingKey, accessPointName)`, and stores the per-AP client counts as TOML in a private Cloudflare KV namespace. The frontend reads the latest snapshot from `/api/wifi/ap-counts/latest.toml`.

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
