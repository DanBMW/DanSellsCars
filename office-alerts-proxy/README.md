# Office alerts proxy

Holds `OFFICE_DISPLAY_SECRET` and forwards `GET /alerts` to the Hedin office-display API so GitHub Pages / LG wall boards never see the secret.

## Setup

1. Set the real upstream in `wrangler.toml` → `UPSTREAM_ALERTS_URL`
2. `npx wrangler secret put OFFICE_DISPLAY_SECRET`
3. `npx wrangler deploy`
4. Point `OFFICE_ALERTS_URL` in `team-board.html` at `https://<this-worker>.workers.dev/alerts`

## Test

```bash
curl -sS "https://<this-worker>.workers.dev/alerts" | jq .
```
