# Developer setup guide

This guide walks you through setting up and running the Plimsoll web app and its
local dependencies end-to-end: cloning the repository, installing dependencies,
configuring environment variables in `.env.local`, and starting both the indexer
via Docker and the Next.js app.

## Prerequisites

Before starting, ensure you have the following installed on your machine:

- **Node.js**: v22.12.0 or higher (`node --version`)
- **npm**: v10 or higher (`npm --version`)
- **Docker** and **Docker Compose**: Docker Desktop (macOS/Windows) or Docker Engine (Linux)
- **Git**: (`git --version`)

---

## 1. Clone the repository

Clone the monorepo and enter the project directory:

```bash
git clone https://github.com/plimsoll-protocol/plimsoll-app.git
cd plimsoll-app
```

---

## 2. Install dependencies

Install the monorepo workspace dependencies and build the TypeScript SDK:

```bash
npm install
npm run build -w @plimsoll/sdk
```

---

## 3. Configure environment variables (`.env.local`)

By default, the web application points directly to the deployed Soroban Testnet
contracts. Running a local indexer is optional, but recommended for full feature
testing (such as fast asset listing, issuer TOML metadata, and report history).

To configure the web app to query your local indexer, create `apps/web/.env.local`:

```bash
# On macOS and Linux:
cat << 'EOF' > apps/web/.env.local
NEXT_PUBLIC_INDEXER_URL=http://localhost:8080
EOF
```

> **Note**: If you want the app to read straight from the Stellar Testnet contracts
> without running an indexer, leave `NEXT_PUBLIC_INDEXER_URL` unset or set it to `none`.

---

## 4. Start the Indexer with Docker

The Plimsoll Indexer ingests events from Soroban contracts and exposes HTTP
endpoints on port `8080`.

You can spin up the indexer with an ephemeral Postgres database using Docker.

### Option A: Using Docker Compose

If you have cloned [`plimsoll-indexer`](https://github.com/plimsoll-protocol/plimsoll-indexer):

```bash
git clone https://github.com/plimsoll-protocol/plimsoll-indexer.git ../plimsoll-indexer
cd ../plimsoll-indexer
docker compose up -d
cd ../plimsoll-app
```

### Option B: Running via Docker command line

```bash
# 1. Start a local Postgres container
docker run -d \
  --name plimsoll-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=plimsoll \
  -p 54329:5432 \
  postgres:16-alpine

# 2. Run the indexer container attached to Postgres and Stellar Testnet
docker run -d \
  --name plimsoll-indexer \
  -p 8080:8080 \
  -e DATABASE_URL="postgres://postgres:postgres@host.docker.internal:54329/plimsoll?sslmode=disable" \
  -e STELLAR_RPC_URL="https://soroban-testnet.stellar.org" \
  -e HORIZON_URL="https://horizon-testnet.stellar.org" \
  -e STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015" \
  -e COVERAGE_LEDGER_ID="CC2QQ7R4FLPHZP7KA5AO4IASXXICTG6N4GQXCXITTEBNYQEYTYXKMN4D" \
  -e REPORTER_REGISTRY_ID="CCZCBR7MGSW5LGIEUQR5TU5Z7JQWBDEESB3RGPTRPMCBUMOISRPY7GOB" \
  ghcr.io/plimsoll-protocol/plimsoll-indexer:latest
```

Verify that the indexer is healthy and answering:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/v1/assets
```

---

## 5. Start the Next.js development server

Start the Next.js app in development mode:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Edits in `apps/web`
will hot-reload automatically.

---

## Running checks locally

Before committing changes, run the repository check suite:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

---

## Windows gotchas

When developing on Windows (PowerShell or Command Prompt):

1. **PowerShell statement chaining**:
   In older PowerShell versions, `&&` is not a valid separator. Use `;` instead:
   ```powershell
   npm run build -w @plimsoll/sdk; npm run dev -w @plimsoll/web
   ```

2. **Quoting environment variables and passphrases**:
   The Stellar testnet passphrase contains spaces and a semicolon (`Test SDF Network ; September 2015`).
   In PowerShell, ensure strings with semicolons are enclosed in quotes:
   ```powershell
   $env:STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
   ```

3. **Writing `.env.local` in PowerShell**:
   Avoid standard `echo ... > apps/web/.env.local` redirection in Windows PowerShell, which writes
   UTF-16 LE encoding by default. Use `Set-Content` with UTF-8 encoding:
   ```powershell
   Set-Content -Path apps/web/.env.local -Value "NEXT_PUBLIC_INDEXER_URL=http://localhost:8080" -Encoding utf8
   ```

4. **Docker Desktop and WSL 2**:
   Ensure Docker Desktop is set to use the **WSL 2 backend** (Settings > General > Use the WSL 2 based engine).
   When connecting containers to localhost using `host.docker.internal`, ensure host networking is
   enabled in Docker Desktop settings.

5. **PowerShell execution policy**:
   If running npm or npx commands outputs an error that `execution of scripts is disabled on this system`,
   run PowerShell as Administrator and run:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```

6. **Line endings (CRLF vs LF)**:
   Ensure Git preserves Unix line endings (`LF`) to avoid lint and prettier diff failures:
   ```bash
   git config core.autocrlf false
   ```
