# Operations

How to run Compliance Hub in production: the image, the first start, backups, the restore drill, VACUUM and key rotation (P5d). Commands run from the repository checkout on the server.

## 1. The key comes first

`DATA_ENCRYPTION_KEY` seals every uploaded document, every conversation's redaction map and every request-link token. A database backup without the key cannot be read, and losing the key loses all of that data. Before the first start, store the key apart from the database and its backups (for example in a password manager), together with `DATA_ENCRYPTION_KEY_VERSION`. The restore drill proves the stored key opens the data.

## 2. First start

Copy `.env.production.example` to `.env.production` and `.env.production.admin.example` to `.env.production.admin`, and fill them in (`openssl rand -base64 32` for `BETTER_AUTH_SECRET` and `DATA_ENCRYPTION_KEY`). Then:

```bash
docker compose --env-file .env.production.admin --profile prod build api
docker compose --env-file .env.production.admin --profile prod up -d db
docker compose --env-file .env.production.admin exec -it db psql -U chub -d chub -c '\password chub_app'
docker compose --env-file .env.production.admin --profile prod up -d
```

The third command asks for the new `chub_app` password; it must match `DATABASE_URL` in `.env.production`. The API refuses to start with the development password. `migrate` applies migrations and both seeds, then exits; `api` starts after it and listens on `127.0.0.1:5191` for a reverse proxy on the same host.

## 3. Reverse proxy

The proxy terminates TLS and forwards to `127.0.0.1:5191`. Set `TRUST_PROXY_HOPS` to the number of proxies. **Do not log request paths for `/r/` and `/api/public/requests/`**: they carry request-link tokens (C3). Log those requests with the path removed, or not at all.

## 4. Backups

Daily, with this cron line:

```
30 2 * * * cd /srv/compliance-hub && scripts/backup.sh /var/backups/chub >> /var/log/chub-backup.log 2>&1
```

(`/srv/compliance-hub` stands for the checkout; `/var/backups/chub` for the dump folder.) Copy each dump off the server. Where to and for how long are not decided yet (section 8).

## 5. Restore drill

Monthly, and after any change to the key:

```bash
DRILL_DATABASE_URL='postgres://chub:<owner password>@localhost:5432/chub_restore_drill' scripts/restore-drill.sh /var/backups/chub/<newest>.dump .env.production
```

It must print `restore drill passed`. Record the date and the `sealed rows opened` line.

## 6. VACUUM

Weekly, after the retention purges:

```
0 3 * * 0 cd /srv/compliance-hub && docker compose --env-file .env.production.admin --profile prod run --rm migrate node --import tsx scripts/vacuum.ts >> /var/log/chub-vacuum.log 2>&1
```

## 7. Rotating DATA_ENCRYPTION_KEY

1. Run a backup and the restore drill.
2. Store the new key (`openssl rand -base64 32`) apart from the database, as in section 1.
3. In `.env.production`: set `DATA_ENCRYPTION_KEY_PREVIOUS` to the old key, `DATA_ENCRYPTION_KEY` to the new key, and `DATA_ENCRYPTION_KEY_VERSION` to the old version plus 1.
4. Run `docker compose --env-file .env.production.admin --profile prod up -d api`.
5. Run `docker compose --env-file .env.production.admin --profile prod run --rm api node --import tsx scripts/reseal.ts` until it prints `reseal done` with all three counts at 0.
6. Run the restore drill on a fresh backup.
7. Empty `DATA_ENCRYPTION_KEY_PREVIOUS` and run step 4 again.
8. Keep the old key until every backup sealed with it has expired.

A second rotation must wait until step 7 is done, because only one previous key is supported.

## 8. Not decided yet

The hosting provider and region (AU and UK data residency is a Stage 3 launch-gate question); the reverse proxy and TLS certificates; the SMTP provider (`SMTP_URL`, `MAIL_FROM`); where off-server dump copies go and how long dumps are kept; monitoring and alerts. None of these is configured by the repository.
