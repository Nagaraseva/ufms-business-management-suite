# UFMS Business Management Suite - Beginner Deployment Guide (Step-by-Step)

> **You are new? Follow this exactly from Step 1 to Step 10. No step to skip.**

---

## PART 0: What You Need to Understand (2 minutes)

This project has 3 parts:
1.  **Frontend (React):** What users see in browser. Folder: `apps/web`
2.  **Backend (NestJS):** The brain that handles login, data, permissions. Folder: `apps/api`
3.  **Database (PostgreSQL):** Where all data is saved. Not files, a database server.

You will run all 3 on your laptop first, then put them on internet.

---

## PART 1: Softwares to Install

You need 5 softwares. All free.

### 1. Visual Studio Code (VS Code) - To open and edit code
- What it does: Code editor
- Download: https://code.visualstudio.com/
- How to install: Open link -> Click big blue "Download" -> Install like any software (Next -> Next -> Finish)
- After install: Open VS Code -> File -> Open Folder -> Select `ufms-business-management-suite` folder

### 2. Node.js 20 LTS - To run the project
- What it does: Runs JavaScript backend and frontend
- Download: https://nodejs.org/en  -> Click button that says `20.x LTS` (NOT Current 22/23)
- How to install: Run installer -> Next -> Next -> Finish
- How to check if installed:
  1. Press `Windows + R` -> type `cmd` -> press Enter
  2. Type `node -v` -> should show `v20.x.x`
  3. Type `npm -v` -> should show `10.x.x`
  - If "not recognized", restart computer and try again

### 3. Git - To download/upload code
- What it does: Version control, push to GitHub
- Download: https://git-scm.com/download/win
- How to install: Run installer -> Keep all default options -> Install
- Check: In `cmd` type `git --version`

### 4. PostgreSQL 15 or 16 - The Database
- What it does: Stores all tenants, users, leads, invoices
- Download: https://www.postgresql.org/download/ -> Choose Windows -> Download Installer from EDB
- How to install:
  1. Run installer -> Password: **remember this!** Use `postgres123` for local (we will change later)
  2. Port: leave `5432`
  3. Locale: Default
  4. Finish
- Also installs `pgAdmin 4` - a tool to see database visually (like Excel for DB)
- Check: Open `pgAdmin 4` -> it will ask for password -> enter `postgres123` -> you should see `PostgreSQL 15` on left

### 5. Postman (Optional but Recommended) - To test APIs
- What it does: Test backend without frontend
- Download: https://www.postman.com/downloads/
- Install like normal software

**Mac Users:** Same links, choose Mac version. For Postgres use `https://postgresapp.com/` is easier.

---

## PART 2: Get The Project on Your Laptop

### Step 1: Copy Project to Your Laptop

**If you have ZIP:**
1. Unzip `ufms-business-management-suite.zip` to `C:\projects\` or `D:\projects\` (create folder if not exists)
2. You should have `C:\projects\ufms-business-management-suite\apps\`

**If using GitHub (after we push):**
```bash
# Open cmd or VS Code Terminal (Ctrl + `)
cd C:\projects
git clone https://github.com/YOUR_USERNAME/ufms-business-management-suite.git
cd ufms-business-management-suite
```

### Step 2: Open in VS Code
1. Open VS Code
2. File -> Open Folder -> `C:\projects\ufms-business-management-suite`
3. You will see `apps`, `packages`, `docs` on left

### Step 3: Install All Dependencies
In VS Code, press `Ctrl + ` ` (backtick, next to 1 key) to open Terminal.

Then run **ONE command at a time**, wait for finish:
```bash
npm install
```
This will take 2-3 minutes. You will see `added 1000 packages`. No red errors = success.

If error `npm not found`, you didn't install Node.js correctly. Restart VS Code.

---

## PART 3: Setup Local Database & Environment

### Step 4: Create Database

**Option A - Using pgAdmin (Easy for beginners):**
1. Open `pgAdmin 4` (from Start Menu)
2. Enter password `postgres123`
3. Left side -> Right click on `Databases` -> Create -> Database
4. Database name: `ufms_dev`
5. Owner: `postgres`
6. Click Save

**Option B - Using Command:**
```bash
# In cmd, type (password is postgres123)
"C:\Program Files\PostgreSQL\15\bin\createdb.exe" -U postgres -h localhost ufms_dev
```

### Step 5: Create `.env` File (MOST IMPORTANT)

This file holds secrets. **Never share it, never upload to GitHub.**

1. In VS Code, you see `.env.example` file. Right click -> Copy -> Paste -> Rename to `.env`
2. Open `.env` -> You will see many lines. **Replace only these:**

```ini
# --- COPY PASTE THIS INTO YOUR .env FILE ---
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/ufms_dev?schema=public"

AUTH_SECRET="replace-this-with-random-32-char-string-change-me-12345"
CREDENTIAL_ENCRYPTION_KEY="another-random-32-char-string-for-encyption-123"

PORT=3000
WEB_PORT=5173

# For local, keep these:
STORAGE_PROVIDER=console
STORAGE_BUCKET=ufms-dev-bucket
STORAGE_MAX_BYTES=10485760

# Leave empty for local:
# STRIPE_WEBHOOK_SECRET=
# RAZORPAY_WEBHOOK_SECRET=
# REDIS_URL=

ALLOW_INSECURE_DEFAULTS=true
NODE_ENV=development
```

**How to generate random secrets (important!):**
- Go to https://generate-secret.vercel.app/32
- Click Generate -> Copy 2 different strings -> Paste into `AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY`

### Step 6: Setup Prisma (Database Tables)

In VS Code Terminal, run:

```bash
# 1. Generate database client
npm run db:generate
# Should say "Generated Prisma Client"

# 2. Create tables in database
npm run db:migrate
# It will ask "Enter a name for the new migration" -> type: init
# Wait 10 seconds -> Should say "migrate completed"

# 3. Add starter data (Plans + Admin user)
npm run db:seed
# Should print: "Seed completed - Admin: admin@ufms.local / Admin@123"
```

**If `npm run db:migrate` fails with "Can't reach database":**
- Check `DATABASE_URL` password is `postgres123` (same as you set in Postgres install)
- Check PostgreSQL service is running: `Windows + R` -> `services.msc` -> Find `postgresql` -> Status should be `Running` -> If not, Right click -> Start

---

## PART 4: Run Project Locally

### Step 7: Start Backend

In VS Code Terminal:
```bash
npm --workspace apps/api run dev
```

You will see:
```
[Nest] LOG [NestApplication] Nest application successfully started
http://localhost:3000/api/docs
```

**DO NOT CLOSE THIS TERMINAL.** This is your backend server.

Test: Open Chrome -> go to `http://localhost:3000/api/docs` -> You will see Swagger API docs with all endpoints.

### Step 8: Start Frontend (New Terminal)

1. In VS Code, click `+` icon in Terminal to open **NEW terminal** (don't close old one)
2. Run:
```bash
npm --workspace apps/web run dev
```
You will see:
```
VITE v5.x ready in 500ms
Local: http://localhost:5173/
```

3. Open Chrome -> `http://localhost:5173` -> Login page appears.
   - Login with: `admin@ufms.local` / `Admin@123` (from seed)

**You are done locally!** Try creating a Tenant in `/platform`, then login as that tenant.

**To stop:** Press `Ctrl + C` in both terminals.

### Step 9: Run Tests (To verify everything works)
```bash
# In a new terminal
npm --workspace apps/web run build
# Should say "built in 2s"

node_modules/.bin/vitest run tests/unit/phase9 tests/unit/phase8 tests/integration/phase7-8
# Should say "3 passed, 18 passed"

node migration/reconciliation/reconcile.mjs
# Should say "10/10 passed"
```

---

## PART 5: Deploy to Internet (So Others Can Use)

Now you want real users to access via `https://yourapp.com`.

### EASYEST WAY FOR BEGINNERS: Render.com (Free Tier Available)

**Why Render?** No need to manage server, free Postgres, auto deploy from GitHub.

#### Step 10.1: Push Code to GitHub
1. Create account on https://github.com
2. Create New Repository -> Name: `ufms-business-management-suite` -> Public/Private -> Create
3. In VS Code Terminal:
```bash
git init
git add .
git commit -m "v1.0.0 ready for deploy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ufms-business-management-suite.git
git push -u origin main
```
Enter GitHub username/password when asked.

#### Step 10.2: Create Database on Render
1. Go to https://dashboard.render.com -> Sign up with GitHub
2. Click `New +` -> `PostgreSQL`
3. Name: `ufms-db` -> Database: `ufms_prod` -> User: `ufms` -> Region: Singapore (closest to India) -> Create
4. Wait 2 mins -> Click database -> Copy `Internal Database URL` (starts with `postgresql://...`) -> **Save it**

#### Step 10.3: Deploy Backend
1. Render Dashboard -> `New +` -> `Web Service`
2. Connect your GitHub repo `ufms-business-management-suite`
3. Fill:
   - Name: `ufms-api`
   - Runtime: `Node`
   - Build Command:
     ```
     npm install && npx prisma generate --schema packages/database/prisma/schema.prisma && npm --workspace apps/api run build
     ```
   - Start Command:
     ```
     npx prisma migrate deploy --schema packages/database/prisma/schema.prisma && node apps/api/dist/main.js
     ```
   - Instance Type: `Starter` (or Free)

4. Click `Advanced` -> Add Environment Variables -> Click `Add` for each:
   ```
   NODE_ENV=production
   PORT=10000
   DATABASE_URL= <paste Internal Database URL from Step 10.2>
   AUTH_SECRET= <go to generate-secret.vercel.app/32 and paste new one>
   CREDENTIAL_ENCRYPTION_KEY= <generate another new one>
   STORAGE_PROVIDER=console
   STORAGE_BUCKET=ufms-prod-bucket
   STORAGE_MAX_BYTES=10485760
   ALLOW_INSECURE_DEFAULTS=false
   ```
   **DO NOT use your local passwords! Generate new secrets.**

5. Click `Create Web Service` -> Wait 5 mins -> You will get URL like `https://ufms-api.onrender.com`
6. Test: Open `https://ufms-api.onrender.com/api/docs` and `https://ufms-api.onrender.com/api/v1/health` -> Should show JSON

#### Step 10.4: Deploy Frontend
1. Render -> `New +` -> `Static Site`
2. Connect same GitHub repo
3. Fill:
   - Name: `ufms-web`
   - Build Command: `npm install && npm --workspace apps/web run build`
   - Publish Directory: `apps/web/dist`
4. Add Env Var:
   ```
   VITE_API_URL=https://ufms-api.onrender.com
   ```
   (Use your backend URL from Step 10.3)
5. Create -> Wait 3 mins -> You get `https://ufms-web.onrender.com`
6. Open it -> Login page -> Login with `admin@ufms.local` / `Admin@123`

**Done! Share `https://ufms-web.onrender.com` with users.**

---

## PART 6: Other Deployment Options

### Option 2: Railway.app (Even easier, 1-click)
Same steps as Render, but Railway auto-detects Node + Postgres. Go to https://railway.app -> New Project -> Deploy from GitHub -> Add Postgres plugin -> Add same env vars.

### Option 3: VPS (Ubuntu Server - For Full Control)
If you buy VPS from Hostinger/DigitalOcean/AWS (Ubuntu 22.04):

```bash
# 1. Connect via SSH
ssh root@YOUR_SERVER_IP

# 2. Install Node + Postgres + Git
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs postgresql git nginx

# 3. Clone code
cd /var/www
git clone https://github.com/YOUR_USERNAME/ufms-business-management-suite.git
cd ufms-business-management-suite

# 4. Setup env (same as local but with production secrets)
cp .env.example .env
nano .env  # paste production values, Ctrl+O to save, Ctrl+X to exit

# 5. Install & Migrate
npm install
npx prisma generate --schema packages/database/prisma/schema.prisma
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
npm run db:seed

# 6. Build
npm --workspace apps/api run build
npm --workspace apps/web run build

# 7. Run with PM2 (keeps running after you logout)
npm install -g pm2
pm2 start apps/api/dist/main.js --name ufms-api
pm2 startup
pm2 save

# 8. Nginx to serve frontend
cp -r apps/web/dist /var/www/html
# Configure nginx to point to /var/www/html and proxy /api to localhost:3000

# 9. SSL (Free HTTPS)
apt install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## PART 7: Daily Work - How to Work on Project After Deploy

### How to Make Changes:
1. Open VS Code -> Edit file in `apps/web/src/pages/Leads.tsx` or `apps/api/src/leads/`
2. Save -> Local server auto-reloads (if running)
3. Test locally
4. Commit & Push -> Render/Railway auto-deploys in 3 mins:
```bash
git add .
git commit -m "fixed lead bug"
git push
```

### How to Create New Tenant (Your Job as Platform Admin):
1. Login as `admin@ufms.local` on frontend
2. Go to `/platform` (Crown icon in sidebar)
3. Click `Create Tenant` -> Enter: `Acme Corp`, `acme`, `acme@example.com`
4. Choose Plan (Starter/Pro)
5. Click Create -> Share `https://ufms-web.onrender.com` + `acme` tenant login to customer

### How to Suspend Non-Paying Customer:
1. `/platform` -> Find tenant -> `Suspend` -> Enter reason -> Confirm
2. That tenant's all users instantly get `403 TENANT_SUSPENDED` (tested)

### How to Backup Database:
```bash
# Local
./scripts/backup-restore.sh backup
# Production Render: Dashboard -> PostgreSQL -> Backups -> Manual Backup
```

### How to See Logs if Something Breaks:
- Render: Dashboard -> Your Service -> Logs (live)
- Local: Terminal where `npm run dev` is running
- Check: `docs/security-review.md` for pen-test before go-live

---

## PART 8: Troubleshooting (Common Beginner Errors)

| Error | Fix |
|-------|-----|
| `npm not found` | Reinstall Node.js 20 LTS, restart VS Code |
| `Cannot connect to database` | Check Postgres running in `services.msc`, check `DATABASE_URL` password |
| `Port 3000 already in use` | Run `npx kill-port 3000` then restart |
| `Prisma migrate failed` | Run `npx prisma generate` first, then `npx prisma migrate dev` |
| `Login fails` | You didn't run `npm run db:seed` - run it |
| Frontend shows blank | Check `VITE_API_URL` in Render env vars, must be backend URL |
| `403 TENANT_SUSPENDED` | Tenant is suspended in `/platform` -> Activate it |
| Build fails on Render | Check Build Command exactly as in guide, check Node version 20 |

---

## PART 9: What to Do Next

1.  **Run locally first** (Parts 1-4) - Make sure login works
2.  **Push to GitHub** (10.1)
3.  **Deploy to Render Free Tier** (10.2 - 10.4) - Test with 2-3 users
4.  **Read `docs/deployment.md`** (technical) and `docs/security-review.md` (pen-test checklist)
5.  **When ready for real customers:** Buy domain (GoDaddy/Namecheap ~ Rs.800/year) -> Connect in Render -> Settings -> Custom Domain -> Add -> Follow DNS instructions

---

## Softwares Summary

| Software | Purpose | Download Link | Must? |
|----------|---------|---------------|-------|
| VS Code | Edit code | https://code.visualstudio.com | Yes |
| Node.js 20 LTS | Run app | https://nodejs.org | Yes |
| Git | Push to GitHub | https://git-scm.com | Yes |
| PostgreSQL 15 | Database | https://www.postgresql.org/download | Yes |
| pgAdmin 4 | See DB data | Comes with Postgres | Yes |
| Postman | Test APIs | https://www.postman.com/downloads | No |
| Docker Desktop | Alternative deploy | https://www.docker.com/products/docker-desktop | No |
| GitHub Account | Store code online | https://github.com/signup | For deploy |
| Render Account | Host app free | https://dashboard.render.com | For deploy |

---

**Need help?** Tell me:
- Windows or Mac?
- You want free hosting (Render) or VPS?
- You stuck at which Step number?

I will generate exact commands for you.

