# Deployment (single VPS, Docker Compose, Nginx)

Target: `applyflow.siavashizadi.com` on the existing VPS, next to the other
apps, without touching their containers, ports or databases.

> Not yet verified on the server: the images were not built in the
> development environment (no Docker daemon there). `docker compose config`
> validates, and CI builds and tests the same code without Docker.

## 1. First deploy

```bash
# on the server
mkdir -p ~/apps && cd ~/apps
git clone https://github.com/TySia-fr/applyflow.git && cd applyflow

cp .env.example .env
# edit .env:
#   NODE_ENV=production
#   APP_URL=https://applyflow.siavashizadi.com
#   BETTER_AUTH_SECRET=$(openssl rand -base64 32)
#   POSTGRES_PASSWORD=$(openssl rand -hex 24)
#   APP_PORT=3003            # pick a port not used by other apps
#   (DATABASE_URL is set by compose; leave the example value)
chmod 600 .env

free -h && df -h           # the build needs ~1.5 GB RAM; the server has swap
docker compose up -d --build
docker compose ps
curl -s http://127.0.0.1:3003/api/health   # {"status":"ok"}
```

`migrate` runs once per `up` and must succeed before `app` starts.

## 2. Nginx + TLS

`/etc/nginx/sites-available/applyflow`:

```nginx
limit_req_zone $binary_remote_addr zone=applyflow_auth:10m rate=10r/m;

server {
  server_name applyflow.siavashizadi.com;
  client_max_body_size 12m;                 # 10 MB uploads + form overhead

  location /api/auth/ {
    limit_req zone=applyflow_auth burst=5 nodelay;
    proxy_pass http://127.0.0.1:3003;
    include /etc/nginx/applyflow-proxy.conf;
  }
  location / {
    proxy_pass http://127.0.0.1:3003;
    include /etc/nginx/applyflow-proxy.conf;
  }
}
```

`/etc/nginx/applyflow-proxy.conf`:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;               # used for rate limits
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_buffering off;                                    # streaming responses
```

```bash
sudo ln -s /etc/nginx/sites-available/applyflow /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d applyflow.siavashizadi.com
```

Add the DNS `A` record for `applyflow` first.

## 3. Updates and rollback

```bash
cd ~/apps/applyflow
git pull --ff-only
docker compose up -d --build        # migrate runs, then the new app replaces the old
curl -fsS http://127.0.0.1:3003/api/health
```

Rollback: `git checkout <previous-sha> && docker compose up -d --build`.
Migrations are additive, so the previous version runs against the newer schema.

## 4. Backups

```bash
# /usr/local/bin/applyflow-backup.sh  (cron: 23 3 * * *)
set -euo pipefail
DIR=/var/backups/applyflow; mkdir -p "$DIR"
cd ~/apps/applyflow
docker compose exec -T db pg_dump -U applyflow -Fc applyflow > "$DIR/db-$(date +%F).dump"
docker run --rm -v applyflow_documents:/d -v "$DIR":/b alpine tar czf /b/docs-$(date +%F).tgz -C /d .
find "$DIR" -type f -mtime +14 -delete
```

Restore (test this once, on a copy):

```bash
docker compose exec -T db pg_restore -U applyflow -d applyflow --clean < db-YYYY-MM-DD.dump
docker run --rm -v applyflow_documents:/d -v "$PWD":/b alpine tar xzf /b/docs-YYYY-MM-DD.tgz -C /d
```

## 5. Optional

- **Email**: set `RESEND_API_KEY` and `EMAIL_FROM` (a verified domain). This
  turns on verification on sign-up and password reset.
- **S3**: set `STORAGE_DRIVER=s3` and every `S3_*` variable. Existing local
  files are not migrated automatically.
