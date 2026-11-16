# Production deployment on Contabo Cloud VPS

Target topology:

| URL | Serves |
|---|---|
| `https://yourdomain.com` and `https://www.yourdomain.com` | Expo web export (`apps/web/dist`) |
| `https://api.yourdomain.com` | Express API (`apps/api`, port 4000, private) |
| `127.0.0.1:5432` | PostgreSQL 16 on the same VPS |

The mobile app is not hosted here. It talks to the API and is built separately with EAS.

## Values used below

| Placeholder | Meaning |
|---|---|
| `VPS_IP` | IPv4 address of the Contabo VPS |
| `yourdomain.com` | Your root domain |
| `crm_user` | PostgreSQL role |
| `CHANGE_ME_DB_PASSWORD` | A long, URL-safe password (letters and digits only) |
| `CHANGE_ME_JWT_SECRET` | Output of `openssl rand -hex 32` |

Replace every placeholder before running the commands. The commands assume Ubuntu 24.04 and root SSH access.

---

## 1. DNS

At the registrar (or Contabo DNS, if the domain uses Contabo nameservers), create:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `VPS_IP` | 300 |
| A | `www` | `VPS_IP` | 300 |
| A | `api` | `VPS_IP` | 300 |

Verify from your laptop:

```bash
nslookup yourdomain.com
nslookup api.yourdomain.com
```

If the domain is behind Cloudflare, keep the records **DNS only (grey cloud)** until the certificate is issued.

---

## 2. Server baseline

```bash
ssh root@VPS_IP
apt update && apt -y upgrade

adduser crm
usermod -aG sudo crm
rsync -a --chown=crm:crm /root/.ssh /home/crm/
```

Open a **second terminal** and confirm key login works before disabling root login:

```bash
ssh crm@VPS_IP
```

Then, back in the root session:

```bash
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

Install packages:

```bash
apt install -y git curl ufw nginx fail2ban unattended-upgrades certbot python3-certbot-nginx
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

Install Node 24 and pnpm:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
corepack enable
corepack prepare pnpm@12.3.4 --activate
node -v
pnpm -v
command -v pnpm
```

If the VPS has less than 4 GB RAM, add 2 GB of swap before building the web app:

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## 3. PostgreSQL

Ubuntu 24.04 ships PostgreSQL 16. Use the PGDG repository to install PostgreSQL 17, which matches the project's CI and is new enough to restore a Neon dump. If Neon is on a newer major version, install that version instead (`postgresql-18` / `postgresql-client-18`).

```bash
apt install -y postgresql-common
install -d /usr/share/postgresql-common/pgdg
curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" > /etc/apt/sources.list.d/pgdg.list
apt update
apt install -y postgresql-17 postgresql-client-17
systemctl enable --now postgresql
pg_lsclusters
```

Confirm the cluster is online on port 5432 before continuing.

```bash
sudo -u postgres psql <<'SQL'
CREATE USER crm_user WITH PASSWORD 'CHANGE_ME_DB_PASSWORD';
CREATE DATABASE crm OWNER crm_user;
GRANT ALL PRIVILEGES ON DATABASE crm TO crm_user;
SQL

sudo -u postgres psql -d crm -c 'GRANT ALL ON SCHEMA public TO crm_user;'
```

Test the exact connection the API will use:

```bash
PGPASSWORD='CHANGE_ME_DB_PASSWORD' psql -h 127.0.0.1 -U crm_user -d crm -c 'select 1;'
```

PostgreSQL listens on `127.0.0.1` by default on Ubuntu. Keep it that way; do not open 5432 in `ufw`.

---

## 4. Code and dependencies

```bash
mkdir -p /srv/crm
chown crm:crm /srv/crm
sudo -u crm git clone https://github.com/MADEDECHADWICK/CRM.git /srv/crm
cd /srv/crm
sudo -u crm pnpm install --frozen-lockfile
```

If the repository is private, add a deploy key for the `crm` user, or clone with a personal access token.

---

## 5. Production environment file

```bash
mkdir -p /etc/crm
cp /srv/crm/deploy/api.env.example /etc/crm/api.env
chown crm:crm /etc/crm/api.env
chmod 600 /etc/crm/api.env
nano /etc/crm/api.env
```

Set:

```dotenv
NODE_ENV=production
PORT=4000
PUBLIC_DOMAIN=yourdomain.com
DATABASE_URL='postgresql://crm_user:CHANGE_ME_DB_PASSWORD@127.0.0.1:5432/crm'
JWT_SECRET='CHANGE_ME_JWT_SECRET'
CORS_ORIGINS='https://yourdomain.com,https://www.yourdomain.com'
```

Generate the JWT secret with `openssl rand -hex 32`.

Treat the existing Neon credentials and JWT secret in local `.env` files as exposed and rotate them at go-live.

---

## 6. Move the existing data from Neon

Run this from the VPS. Use the **direct** (non-pooler) Neon connection string.

```bash
pg_dump 'postgresql://NEON_USER:NEON_PASSWORD@NEON_DIRECT_HOST/neondb?sslmode=require' \
  --no-owner --no-privileges -Fc -f /tmp/crm.dump

PGPASSWORD='CHANGE_ME_DB_PASSWORD' pg_restore \
  -h 127.0.0.1 -U crm_user --no-owner --no-privileges \
  -d crm /tmp/crm.dump
```

The dump includes the `_prisma_migrations` table, so Prisma will see the database as up to date. Confirm with:

```bash
sudo -u crm bash -c "set -a; . /etc/crm/api.env; set +a; cd /srv/crm && pnpm --filter api exec prisma migrate status"
```

If you prefer a fresh database instead, create it empty and skip the dump/restore. Do not run the demo seed in production; it refuses unless `ALLOW_DEMO_SEED=true`.

---

## 7. Generate the Prisma client and apply migrations

```bash
sudo -u crm bash -c "set -a; . /etc/crm/api.env; set +a; cd /srv/crm && pnpm --filter api exec prisma generate && pnpm --filter api exec prisma migrate deploy"
```

Migrations are idempotent. Running this after the restore should report no pending migrations.

---

## 8. API service

```bash
cp /srv/crm/deploy/crm-api.service /etc/systemd/system/crm-api.service
systemctl daemon-reload
systemctl enable --now crm-api
systemctl status crm-api --no-pager
curl -s http://127.0.0.1:4000/
journalctl -u crm-api -n 50 --no-pager
```

If `pnpm` is not found by systemd, replace `ExecStart` with the absolute path printed by `command -v pnpm`.

---

## 9. Build the web app

```bash
sudo -u crm bash -c 'cd /srv/crm && CI=1 EXPO_PUBLIC_API_URL=https://api.yourdomain.com pnpm --filter web build'
ls -la /srv/crm/apps/web/dist
chmod -R o+rX /srv/crm/apps/web/dist
```

`EXPO_PUBLIC_API_URL` is embedded at build time. Rebuild whenever the API domain changes.

---

## 10. Nginx

```bash
DOMAIN=yourdomain.com
cp /srv/crm/deploy/nginx.conf /etc/nginx/sites-available/crm
sed -i "s/yourdomain.com/$DOMAIN/g" /etc/nginx/sites-available/crm
ln -sf /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/crm
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

Ensure the Nginx user can traverse the bundle path:

```bash
chmod o+x /srv /srv/crm
chmod -R o+rX /srv/crm/apps/web/dist
```

Do not overwrite `/etc/nginx/sites-available/crm` after running Certbot; Certbot adds the TLS configuration to that file.

---

## 11. HTTPS

```bash
certbot --nginx \
  -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com \
  --redirect
certbot renew --dry-run
```

Certbot installs a renewal timer. Confirm it exists:

```bash
systemctl list-timers | grep certbot
```

---

## 12. Verify

From your laptop:

```bash
curl -s https://api.yourdomain.com/
curl -I https://yourdomain.com
curl -m 5 http://VPS_IP:4000/
```

The last command must time out. In the browser:

1. Open `https://yourdomain.com` and log in.
2. In DevTools, confirm no CORS or mixed-content errors.
3. Refresh on an inner screen; the SPA fallback must return the app.
4. Confirm `http://yourdomain.com` redirects to HTTPS.
5. Confirm `https://www.yourdomain.com` also loads.

---

## 13. Backups

```bash
cp /srv/crm/deploy/backup.sh /usr/local/bin/crm-backup
chmod +x /usr/local/bin/crm-backup
mkdir -p /var/backups/crm
/usr/local/bin/crm-backup
ls -la /var/backups/crm
```

Schedule it:

```bash
crontab -e
```

Add:

```cron
0 2 * * * /usr/local/bin/crm-backup
```

Also enable Contabo snapshots if the plan includes them.

---

## 14. Deploying updates

```bash
cp /srv/crm/deploy/deploy.sh /usr/local/bin/crm-deploy
chmod +x /usr/local/bin/crm-deploy
sudo crm-deploy
```

The script pulls `main`, installs dependencies, applies migrations, rebuilds the web bundle, restarts the API and reloads Nginx. It reads `PUBLIC_DOMAIN` from `/etc/crm/api.env`.

Useful commands:

```bash
journalctl -u crm-api -f
systemctl restart crm-api
nginx -t && systemctl reload nginx
```

---

## 15. Mobile app

The mobile app is not part of this VPS deployment. Build it with the production API URL:

```bash
EXPO_PUBLIC_API_URL=https://api.yourdomain.com pnpm --filter mobile eas build
```

---

## 16. Troubleshooting

| Symptom | Check |
|---|---|
| `502 Bad Gateway` | `systemctl status crm-api`, `journalctl -u crm-api -n 100`, confirm port 4000 is listening |
| API exits at boot | `JWT_SECRET` or `DATABASE_URL` missing; Prisma client not generated |
| `pnpm: command not found` in systemd | Set `ExecStart` to `command -v pnpm`'s output |
| CORS errors in browser | `CORS_ORIGINS` must list the exact scheme and host, including `www` |
| 404 after refresh | Nginx `try_files` missing the `/index.html` fallback |
| 403 loading JS/CSS | `chmod -R o+rX /srv/crm/apps/web/dist`, and `chmod o+x /srv /srv/crm` |
| Certbot fails | DNS not propagated, Cloudflare proxy enabled, or port 80 blocked |
| `prisma migrate` cannot connect | `systemctl status postgresql`, test with `psql -h 127.0.0.1 -U crm_user -d crm` |
| Build killed / out of memory | Add swap, or `NODE_OPTIONS=--max-old-space-size=2048` before the build |
| `git pull` permission denied | Repo must be owned by `crm`; it was cloned as `crm` |
| Login works then 401 later | The JWT secret changed; users must log in again |

Never install with `NODE_ENV=production`; `tsx` and `prisma` are devDependencies. The deploy script uses `--prod=false` for that reason.

---

## 17. Go-live checklist

- [ ] DNS resolves for `@`, `www`, `api`
- [ ] SSH root login and password login disabled; key login works
- [ ] `ufw` active; only 22, 80, 443 reachable
- [ ] Port 4000 not reachable from the internet
- [ ] PostgreSQL running on `127.0.0.1` only
- [ ] Neon data restored; `prisma migrate status` is up to date
- [ ] `/etc/crm/api.env` is `chmod 600`, secrets rotated
- [ ] `crm-api` enabled and restarts automatically
- [ ] Web bundle built with the production API URL
- [ ] HTTPS works for all three hostnames; renewal dry-run passes
- [ ] Login, data entry and reporting work in the browser
- [ ] `crm-backup` runs and the cron entry exists
- [ ] Uptime monitoring configured for web and API
- [ ] Mobile app rebuilt against the production API URL
