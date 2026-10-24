#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. Copyright (c) City Politics INC.
#
# One-time (idempotent) setup of the designer on Fly.io, in the org $FLY_ORG (default "personal"), region ord:
#   cp-design (frontend, public), cp-design-backend, cp-design-exporter (Flycast, stops when idle), cp-design-valkey,
#   and cp-design-db (Fly Postgres, one shared-cpu-1x 512 MB node, 3 GB volume) with its own role and database for
#   Penpot, whose credentials go straight into the backend's secrets (never printed).
# Needs FLY_API_TOKEN in the environment. Safe to run again: anything that exists is left as it is.
set -euo pipefail
ORG="${FLY_ORG:-personal}"
REGION="${FLY_REGION:-ord}"
FLY="${FLYCTL:-flyctl}"

exists() { "$FLY" status -a "$1" >/dev/null 2>&1 || "$FLY" apps list --json 2>/dev/null | grep -q "\"Name\": *\"$1\""; }

for app in cp-design cp-design-backend cp-design-exporter cp-design-valkey; do
  if exists "$app"; then echo "app $app: exists"; else "$FLY" apps create "$app" -o "$ORG"; fi
done

# The exporter is reached over Flycast (a private IPv6 behind Fly's proxy), so it can start on demand.
if ! "$FLY" ips list -a cp-design-exporter 2>/dev/null | grep -q private; then "$FLY" ips allocate-v6 --private -a cp-design-exporter; fi
# The frontend: a shared IPv4 and an IPv6 (both free) for design.citypolitics.org.
if ! "$FLY" ips list -a cp-design 2>/dev/null | grep -qE 'v6|v4'; then "$FLY" ips allocate-v4 --shared -a cp-design; "$FLY" ips allocate-v6 -a cp-design; fi

if exists cp-design-db; then
  echo "postgres cp-design-db: exists"
else
  "$FLY" postgres create --name cp-design-db --org "$ORG" --region "$REGION" --initial-cluster-size 1 \
    --vm-size shared-cpu-1x --vm-memory 512 --volume-size 3 >/dev/null
  echo "postgres cp-design-db: created"
fi

# Penpot's role and database, attached to the backend. The connection string flyctl prints is parsed here and turned
# into Penpot's settings (JDBC wants the user and password apart from the URI); nothing is echoed.
if ! "$FLY" secrets list -a cp-design-backend 2>/dev/null | grep -q PENPOT_DATABASE_PASSWORD; then
  out="$("$FLY" postgres attach cp-design-db -a cp-design-backend --database-name penpot --database-user penpot --variable-name PENPOT_FLY_DATABASE_URL --yes 2>&1)" || { echo "postgres attach failed" >&2; exit 1; }
  url="$(grep -oE 'postgres(ql)?://[^[:space:]]+' <<<"$out" | head -1)"
  [ -n "$url" ] || { echo "postgres attach printed no connection string" >&2; exit 1; }
  python3 - "$url" <<'PY' | "$FLY" secrets import --stage -a cp-design-backend >/dev/null
import sys, urllib.parse as u
p = u.urlsplit(sys.argv[1])
print(f"PENPOT_DATABASE_URI=postgresql://{p.hostname}:{p.port or 5432}{p.path}")
print(f"PENPOT_DATABASE_USERNAME={u.unquote(p.username)}")
print(f"PENPOT_DATABASE_PASSWORD={u.unquote(p.password)}")
PY
  unset out url
  echo "postgres: penpot role and database attached to cp-design-backend"
fi

# A secret key for sessions and tokens, made here once unless one is already set (or GitHub provides one).
if ! "$FLY" secrets list -a cp-design-backend 2>/dev/null | grep -q PENPOT_SECRET_KEY; then
  key="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')"
  printf 'PENPOT_SECRET_KEY=%s\n' "$key" | "$FLY" secrets import --stage -a cp-design-backend >/dev/null
  printf 'PENPOT_SECRET_KEY=%s\n' "$key" | "$FLY" secrets import --stage -a cp-design-exporter >/dev/null
  unset key
  echo "secret key: set on the backend and the exporter"
fi
# design.citypolitics.org's certificate (Fly issues it once the DNS record points at cp-design.fly.dev: a CNAME,
# DNS only, not proxied).
if ! "$FLY" certs show design.citypolitics.org -a cp-design >/dev/null 2>&1; then "$FLY" certs add design.citypolitics.org -a cp-design >/dev/null && echo "certificate: requested"; fi
echo "bootstrap: done"
