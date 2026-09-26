# Wi-Fi client exclusions

The Worker samples the API at 00:15 JST to refresh the client-ID exclusion list and at 03:00 JST to save per-AP client counts as TOML. Both records are held in a private Cloudflare KV namespace; client IDs and snapshots are not committed to Git.

## Cloudflare setup

Create a KV namespace:

```sh
pnpm exec wrangler kv namespace create WIFI_STATE
```

Copy the returned namespace ID into `wrangler.jsonc`, replacing `REPLACE_WITH_KV_NAMESPACE_ID`, then deploy:

```sh
pnpm deploy
```

The configured cron expressions are `15 15 * * *` UTC (00:15 JST) and `0 18 * * *` UTC (03:00 JST). Cloudflare cron schedules are UTC. A newly added trigger can take several minutes to propagate.

## Sampling and exclusion behavior

- Every successful scheduled run replaces the exclusion set with IDs present at that observation. Those clients are omitted from subsequent live `/api/wifi/clients/list` responses.
- This deliberately starts with the quick experiment requested. It excludes a client ID after one 00:15 sighting, not after proving 48 hours of continuous connection. If the endpoint still returns the previous JST day's snapshot, the Worker rejects it and leaves the previous exclusion set unchanged.
- The API calls this field `randomId` and documents it as stable within the client's observation day in Japan. It is not a cross-day device identifier, so this first version cannot establish that the same device remained connected for 48 hours. The exclusion set is replaced daily because yesterday's IDs are not expected to match today's.
- A failed fetch, non-2xx API response, malformed response, stale observation, or missing string `clients[].randomId` fails the scheduled invocation and leaves the last valid exclusion list unchanged. Inspect Worker logs after the first run.

## 03:00 AP-count snapshot

At 03:00 JST, the Worker reads the raw client list, counts clients grouped by `(buildingKey, accessPointName)`, and stores a dated TOML record in KV with a 90-day TTL. It also updates the latest snapshot. The frontend fetches `/api/wifi/ap-counts/latest.toml`, parses that TOML, and uses the AP counts for the treemap. This is a once-daily snapshot; refreshing the frontend does not make the counts live. `measured_at` records the API observation time, which may differ from the 03:00 trigger time. The API lists connected clients rather than the AP inventory, so APs with zero connected clients are absent from this snapshot.

The TOML format is:

```toml
format_version = 1
measured_at = "2026-09-27T03:00:00.000Z"

[[access_points]]
name = "ap-kappa-1f-east"
building_key = "kappa"
client_count = 12
```

If the API fails or its observation is from another JST day, the collector leaves the last valid TOML snapshot unchanged.

## API contract to confirm

The UI currently uses top-level `measuredAt` and each client's `accessPointName` and optional `buildingKey`. The API documents each client as also having `randomId`, `measuredAt`, `rotatedAt`, and `areaKeys`. The Worker uses `randomId` for sampling and filtering. The API also says the merged response may include processed observations while newer snapshots are still pending, and that snapshots are normally complete within ten minutes of the newest raw observation; inspect the returned timestamps and Worker logs when validating the scheduled sample.
