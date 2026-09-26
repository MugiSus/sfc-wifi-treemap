# Wi-Fi client exclusions

The Worker polls at 00:15 JST with a Cloudflare Cron Trigger. It stores that observation's exclusion IDs in a private KV namespace; no client IDs are committed to Git.

## Cloudflare setup

Create a KV namespace:

```sh
pnpm exec wrangler kv namespace create WIFI_STATE
```

Copy the returned namespace ID into `wrangler.jsonc`, replacing `REPLACE_WITH_KV_NAMESPACE_ID`, then deploy:

```sh
pnpm deploy
```

The configured cron is `15 15 * * *` UTC, which is 00:15 JST. Cloudflare cron schedules are UTC. A newly added trigger can take several minutes to propagate.

## Sampling and exclusion behavior

- Every successful scheduled run replaces the exclusion set with IDs present at that observation. Those clients are omitted from subsequent live `/api/wifi/clients/list` responses.
- This deliberately starts with the quick experiment requested. It excludes a client ID after one 00:15 sighting, not after proving 48 hours of continuous connection. If the endpoint still returns the previous JST day's snapshot, the Worker rejects it and leaves the previous exclusion set unchanged.
- The API calls this field `randomId` and documents it as stable within the client's observation day in Japan. It is not a cross-day device identifier, so this first version cannot establish that the same device remained connected for 48 hours. The exclusion set is replaced daily because yesterday's IDs are not expected to match today's.
- A failed fetch, non-2xx API response, malformed response, stale observation, or missing string `clients[].randomId` fails the scheduled invocation and leaves the last valid exclusion list unchanged. Inspect Worker logs after the first run.

## API contract to confirm

The UI currently uses top-level `measuredAt` and each client's `accessPointName` and optional `buildingKey`. The API documents each client as also having `randomId`, `measuredAt`, `rotatedAt`, and `areaKeys`. The Worker uses `randomId` for sampling and filtering. The API also says the merged response may include processed observations while newer snapshots are still pending, and that snapshots are normally complete within ten minutes of the newest raw observation; inspect the returned timestamps and Worker logs when validating the scheduled sample.
