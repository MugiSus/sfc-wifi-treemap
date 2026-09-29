# Per-AP connected-client count snapshot

The frontend reads `/api/wifi/clients/list` and counts clients per AP after removing clients whose upstream `autoExcluded` or `blacklisted` flag is true. It keeps the existing building → floor → AP treemap, labels, colors, and observation-time / count footer. No additional UI is added. It does not subtract the local 03:00 AP-count baseline because the upstream flags already classify excluded clients. Invalid responses, missing flags, or failed requests retain the previous observation using the existing failed-update behavior.

The `/crowd` endpoint returns area totals and cannot provide AP counts. The updated Wi-Fi client list exposes the same exclusion flags together with AP names, allowing this app to use upstream exclusion processing without replacing AP tiles with floor tiles.

The Worker still runs its existing scheduled job at 03:00 JST. It groups all connected clients by `(buildingKey, accessPointName)` and stores per-AP counts as TOML in a private Cloudflare KV namespace. `/api/wifi/ap-counts/latest.toml` remains available, but is not used by this frontend.

API reference: https://api.dtc.wide.ad.jp/#tag/wifi

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
