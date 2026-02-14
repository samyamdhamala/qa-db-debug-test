# Use a modern Node.js image (buster is too old and breaks apt repos)
FROM node:20-bookworm

# Set environment variables
ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    POSTGRES_USER=testuser \
    POSTGRES_PASSWORD=password \
    POSTGRES_DB=testdb

# Install PostgreSQL and dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends postgresql postgresql-contrib && \
    rm -rf /var/lib/apt/lists/*

# Configure PostgreSQL authentication (version-agnostic)
RUN set -eux; \
    PGVER="$(ls /etc/postgresql | head -n 1)"; \
    echo "Detected PostgreSQL version: $PGVER"; \
    echo "host all all 0.0.0.0/0 md5" >> "/etc/postgresql/$PGVER/main/pg_hba.conf"; \
    echo "listen_addresses='*'" >> "/etc/postgresql/$PGVER/main/postgresql.conf"

# Copy only the base64 SQL (so we can init DB during build)
COPY setup_db.sql.b64 /tmp/setup_db.sql.b64

# Initialize PostgreSQL: start, create db/user if missing, run schema, stop
RUN set -eux; \
    service postgresql start; \
    \
    # Create role if missing (run as postgres OS user)
    su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'\" | grep -q 1 || psql -c \"CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}';\""; \
    \
    # Create database if missing and set owner
    su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'\" | grep -q 1 || createdb -O ${POSTGRES_USER} ${POSTGRES_DB}"; \
    \
    # Run schema into the DB as postgres (no peer issues)
    base64 -d /tmp/setup_db.sql.b64 | su - postgres -c "psql -d '${POSTGRES_DB}' -v ON_ERROR_STOP=1 -f -"; \
    \
    # Ensure privileges (optional, but safe)
    su - postgres -c "psql -d '${POSTGRES_DB}' -c \"GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${POSTGRES_USER};\""; \
    \
    service postgresql stop


# Set up the working directory for the app
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci || npm install

# Copy the rest of the project
COPY . .

# (Windows fix) remove CRLF from shell script if needed
RUN sed -i 's/\r$//' run_test.sh || true

# Run the test when the container starts
CMD ["sh", "./run_test.sh"]
