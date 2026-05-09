#!/command/with-contenv bash
# 01-init-data.sh — first-boot setup of /data, postgres cluster, uploads
set -eu

DATA_DIR=/data
PG_DATA="${PGDATA:-/data/postgres}"
UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"

# Create top-level data structure
mkdir -p "$PG_DATA" "$UPLOADS_DIR" "$UPLOADS_DIR/branding" "$UPLOADS_DIR/avatars" \
         "$UPLOADS_DIR/jobs" "$UPLOADS_DIR/qr"
chown -R postgres:postgres "$PG_DATA"
chmod 700 "$PG_DATA"
# Uploads owned by node (we run node as root inside container; permissive)
chmod -R 755 "$UPLOADS_DIR"

# Initialise postgres cluster on first run
if [ ! -s "$PG_DATA/PG_VERSION" ]; then
  echo "[init] Initialising new PostgreSQL cluster at $PG_DATA"
  gosu postgres /usr/lib/postgresql/16/bin/initdb \
    --pgdata="$PG_DATA" \
    --auth-local=trust --auth-host=md5 \
    --encoding=UTF8 --locale=C.UTF-8 --username=postgres >/dev/null

  # Listen only on localhost inside container
  echo "listen_addresses = '127.0.0.1'" >> "$PG_DATA/postgresql.conf"
  echo "shared_buffers = 128MB"           >> "$PG_DATA/postgresql.conf"
  echo "max_connections = 50"             >> "$PG_DATA/postgresql.conf"

  # Start temporarily to create role + db
  gosu postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$PG_DATA" \
        -o "-c listen_addresses='127.0.0.1' -p 5432" -w start

  gosu postgres psql -v ON_ERROR_STOP=1 <<-SQL
    CREATE ROLE circularity LOGIN PASSWORD 'circularity';
    CREATE DATABASE circularity OWNER circularity ENCODING 'UTF8';
    GRANT ALL PRIVILEGES ON DATABASE circularity TO circularity;
SQL

  gosu postgres /usr/lib/postgresql/16/bin/pg_ctl -D "$PG_DATA" -m fast -w stop
  echo "[init] Database created"
fi

echo "[init] Data directory ready"
