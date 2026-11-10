# Deployment

Target: `applyflow.siavashizadi.com` on a small shared VPS (3.7 GB RAM,
other apps on ports 3001, 3002, 5678). ApplyFlow uses port **3003**, its own
compose project, database and volumes; nothing is shared with the other apps.

## How it works

```
push to main ─► CI: lint · typecheck · tests · build · E2E
                   └─ all green ─► build images ─► ghcr.io/tysia-fr/applyflow:sha-<commit>
                                                    ghcr.io/tysia-fr/applyflow-migrate:sha-<commit>
server: deploy/update.sh ─► pull images ─► migrate ─► swap app ─► health check
                                                              └─ unhealthy ─► roll back
```

**The server never builds.** A Next.js build needs more memory than the VPS
can spare next to the other apps; pulling a prebuilt image needs almost none.
Images are tagged with the commit SHA, so every deploy is a known version and
rollback is instant. Containers have hard memory limits (db 256 MB, app 448 MB).

## First deploy

1. DNS: an `A` record for `applyflow` pointing at the server's IP.
2. Merge to `main` and wait for CI's **image** job to finish.
3. GHCR packages start private. Once, in GitHub → your profile → Packages →
   `applyflow` and `applyflow-migrate` → Package settings → Change visibility →
   **Public**. (Or keep them private and run `sudo docker login ghcr.io` on
   the server with a read-only token.)
4. On the server:

```bash
curl -fsSLO https://raw.githubusercontent.com/TySia-fr/ApplyFlow/main/deploy/install.sh
less install.sh
bash install.sh
```

`install.sh` checks DNS, port, disk and tools before changing anything; then
creates `~/apps/applyflow/.env` with fresh secrets (never overwrites an
existing one), pulls and starts the stack, installs the Nginx site (validated
with `nginx -t`; removed again if invalid), obtains the certificate with
certbot, and installs the nightly backup. Re-running it is safe.

## Telegram bot and job discovery

After the first deploy, once:

```bash
cd ~
curl -fsSL "https://raw.githubusercontent.com/TySia-fr/ApplyFlow/main/deploy/install.sh?v=$(date +%s)" -o install.sh
bash install.sh                              # new scripts, cron, /api/cron block
cd ~/apps/applyflow && ./setup-integrations.sh
```

`setup-integrations.sh` asks (hidden input) for the bot token from @BotFather
and the La Bonne Alternance API key, verifies the token belongs to
@ApplyFlowAppBot, writes `.env`, restarts the app and registers the webhook.
Either can be skipped with Enter. Cron (installed by `install.sh`): offers at
06:50 UTC, reminders every 15 minutes; log in `/var/log/applyflow-cron.log`.

## Updates

```bash
cd ~/apps/applyflow
./update.sh                 # latest commit on main
./update.sh sha-abc1234     # a specific version (also how you roll back by hand)
```

If the new version fails its health check, `update.sh` restarts the previous
one and prints the logs. Migrations are additive, so an older app runs against
a newer schema.

## Backups and restore

Nightly at 03:41 to `/var/backups/applyflow`: a `pg_dump` and a tarball of the
documents volume, kept 14 days. Log: `/var/log/applyflow-backup.log`.

Restore (try it once on purpose, so it's known to work):

```bash
cd ~/apps/applyflow
sudo docker compose -f compose.prod.yaml exec -T db pg_restore -U applyflow -d applyflow --clean < /var/backups/applyflow/db-YYYY-MM-DD.dump
sudo docker run --rm -v applyflow_documents:/d -v /var/backups/applyflow:/b alpine tar xzf /b/docs-YYYY-MM-DD.tgz -C /d
```

## Operations

| Task | Command |
|---|---|
| Logs | `sudo docker compose -f compose.prod.yaml logs -f app` |
| Status | `sudo docker compose -f compose.prod.yaml ps` |
| Running version | `cat ~/apps/applyflow/.deployed-tag` |
| Security events | `… logs app \| grep '"msg":"security"'` |
| Enable email | set `RESEND_API_KEY` and `EMAIL_FROM` in `.env`, then `./update.sh` |

## Local full stack

`compose.yaml` (repo root) builds the images locally instead of pulling:
`POSTGRES_PASSWORD=dev docker compose up -d --build`.
