# Hanabi Live Development Server Guide

Quick reference for starting and monitoring the Hanabi Live development server.

## Prerequisites

- PostgreSQL running with database "hanabi" and user "hanabiuser"
- Node.js and npm installed
- Go installed

## Starting the Server

### 1. Start the Backend (Go server)

```bash
./run.sh
```

**What it does:**
- Creates logs directory
- Builds the Go server (`server/build_server.sh`)
- Starts the server listening on port 80

**Monitoring logs:**
```bash
tail -f /path/to/output/file
# Or check the terminal where you ran ./run.sh
```

### 2. Start the Frontend (TypeScript/Client build watcher)

In a **separate terminal**:

```bash
./packages/client/esbuild_dev.sh
```

**What it does:**
- Watches TypeScript files for changes
- Automatically rebuilds `main.min.js` when you edit client code
- Runs continuously until you stop it (Ctrl+C)

## Accessing the Application

- **Main URL:** http://localhost/
- **Auto-login as test user:** http://localhost/?login=test1
- **Other test users:** test2, test3, etc.

## Common Tasks

### Restart After Code Changes

**TypeScript changes:**
- No restart needed! esbuild auto-rebuilds
- Just refresh your browser

**Go server changes:**
1. Stop the server (Ctrl+C in the `./run.sh` terminal)
2. Run `./run.sh` again

**Database schema changes:**
```bash
./install/install_database_schema.sh
```

### Regenerate Variants

If you modify variant generation code:

```bash
npm run create-variants-json
```

### View Server Logs

If running in background, logs are typically in:
- `/private/tmp/claude-501/-Users-rkass-repos-hanabi-live/tasks/[task_id].output`

Or check the terminal where `./run.sh` is running.

## Troubleshooting

### Port 80 Permission Error (macOS/Linux)

If you get permission errors on port 80:

**Option 1:** Change port in `.env`:
```bash
LOCALHOST_PORT="8000"
```
Then access at http://localhost:8000/

**Option 2:** Run with sudo:
```bash
sudo ./run.sh
```

### Page Stuck on "Loading..."

This means the client JavaScript hasn't been built:
1. Make sure `./packages/client/esbuild_dev.sh` is running
2. Check for a 404 error on `/public/js/bundles/main.min.js` in browser console
3. Refresh the page after esbuild finishes building

### Database Connection Errors

1. Check PostgreSQL is running:
```bash
brew services list | grep postgresql
```

2. Verify `.env` has correct credentials:
```
DB_USER="hanabiuser"
DB_PASSWORD="1234567890"
DB_NAME="hanabi"
```

## Quick Reference: Two-Terminal Setup

**Terminal 1 (Backend):**
```bash
cd /Users/rkass/repos/hanabi-live
./run.sh
# Keep this running
```

**Terminal 2 (Frontend):**
```bash
cd /Users/rkass/repos/hanabi-live
./packages/client/esbuild_dev.sh
# Keep this running
```

**Browser:**
- Open http://localhost/

## Environment Files

- `.env` - Server configuration (database, ports, session secret)
- Generated at: `/Users/rkass/repos/hanabi-live/.env`

## Important Paths

- **Server code:** `server/src/`
- **Client code:** `packages/client/src/`
- **Variants:** `packages/game/src/json/variants.json` (generated file)
- **Variant source:** `packages/scripts/src/createVariantsJSON/getVariantDescriptions.ts`
- **Database schema:** `install/database_schema.sql`

## Notes for Claude Code

When starting a new session:
1. Check if servers are already running (look for processes on port 80/8081)
2. If not running, start both terminals as shown above
3. Wait for "Listening on port 80" message before testing
4. Check for "build finished" message from esbuild
5. Background tasks can be monitored via `/private/tmp/claude-501/.../*.output` files
