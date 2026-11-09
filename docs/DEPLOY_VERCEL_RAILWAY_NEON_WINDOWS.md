# Deploy on Windows — Vercel + Railway + Neon (Best Stack)

> **Time: 10 minutes. Cost: ₹0 to start. No credit card needed.**
> This is the best stack for you: Easy, Graphical, Expands without code change.

---

## What You Are Creating (Picture)

```
Your Windows Laptop (VS Code)
      |
      | git push
      v
   GitHub (stores code)
      |
      |----> Vercel (Frontend - React)  --> https://yourapp.vercel.app  (Users see this)
      |
      |----> Railway (Backend - NestJS)  --> https://yourapp.up.railway.app (Brain)
                |
                v
              Neon (Database - Postgres)  (Where data lives)
```

**You do step 1-3 once. After that, every change is `git push` -> Live in 60 seconds.**

---

## STEP 0: Before You Start - Checklist (2 min)

On your Windows laptop, make sure you have:

1. **VS Code** installed - https://code.visualstudio.com
2. **Node.js 20 LTS** - https://nodejs.org (click `20.x LTS`, NOT 22)
3. **Git** - https://git-scm.com/download/win (install with default Next->Next)
4. **This project** unzipped to `C:\projects\ufms-business-management-suite\`

**Test in VS Code Terminal (Ctrl + `):**
```bash
node -v
# should show v20.x.x

npm -v
# should show 10.x.x

git --version
# should show git version
```
If any says "not found", restart computer.

---

## STEP 1: Push Code to GitHub (3 min) - Windows

GitHub is where Vercel & Railway will read your code from.

1. Go to **https://github.com** -> Sign up / Login
2. Click **+** (top right) -> **New repository**
3. Name: `ufms-business-management-suite`
4. Choose **Private** (so no one else sees)
5. **DO NOT** check "Add README"
6. Click **Create repository**

You will see a page with commands. Now do this on Windows:

1. Open **VS Code** -> File -> Open Folder -> `C:\projects\ufms-business-management-suite`
2. Press `Ctrl + `` (backtick, next to 1) to open Terminal
3. Copy-paste **one by one** (wait for each to finish):

```bash
git init
git add .
git commit -m "v1.0.0 ready - Vercel Railway Neon"
git branch -M main
```

4. Go back to GitHub page -> Copy the URL that looks like `https://github.com/YOURNAME/ufms-business-management-suite.git`

5. In VS Code Terminal, paste (replace YOURNAME):
```bash
git remote add origin https://github.com/YOURNAME/ufms-business-management-suite.git
git push -u origin main
```

6. It will ask for GitHub login -> Login in browser -> Authorize

**Success:** Refresh GitHub page -> You see `apps`, `packages`, `vercel.json`, `railway.json` files.

**If error "remote origin already exists":**
```bash
git remote remove origin
git remote add origin https://github.com/YOURNAME/ufms-business-management-suite.git
git push -u origin main
```

---

## STEP 2: Create Database on Neon (2 min) - Most Graphical DB

Neon is free Postgres that never sleeps, with Excel-like dashboard.

1. Go to **https://neon.tech** -> Click **Sign Up** (use GitHub login - 1 click)
2. Click **Create Project**
3. Fill:
   - Project Name: `ufms-prod`
   - Region: **Singapore** (closest to India, fastest)
   - Postgres Version: 16 (default)
4. Click **Create Project**
5. You will see **Connection String** - It looks like:
   ```
   postgresql://neon_user:password@ep-xxx-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
6. **COPY IT** -> Save in Notepad temporarily. **This is your DATABASE_URL.**

**Why Neon is best for you:**
- Click **Tables** -> See `tenants`, `users` like Excel
- Click **Branches** -> Create `staging` copy of DB -> Test safely
- **Time Travel:** Restore to any second in last 7 days (if you delete data by mistake)
- 0.5GB free = ~50,000 leads, enough for 6 months

---

## STEP 3: Deploy Backend on Railway (3 min) - Most Graphical Backend

Railway is where your NestJS brain will run. It has live graphs.

1. Go to **https://railway.app** -> **Login with GitHub** (1 click)
2. Click **New Project** -> **Deploy from GitHub repo**
3. Choose `ufms-business-management-suite` (authorize Railway to read GitHub if asked)
4. Railway will show your repo -> **Click it**
5. Railway auto-detects -> It will say "Add Service" -> Click **Add Service** -> Choose your repo again
6. Now you have a service -> Click it -> Go to **Variables** tab (left side)
7. Click **+ New Variable** -> Add **one by one**:

```
NODE_ENV = production
PORT = 3000
DATABASE_URL = (paste the Neon URL from Step 2 - the long postgresql://... string)
AUTH_SECRET = (generate new: go to https://generate-secret.vercel.app/32 -> Copy -> Paste)
CREDENTIAL_ENCRYPTION_KEY = (generate another new one at same site -> Paste)
CORS_ORIGINS = https://yourapp.vercel.app
ALLOW_INSECURE_DEFAULTS = false
STORAGE_PROVIDER = console
STORAGE_BUCKET = ufms-prod
STORAGE_MAX_BYTES = 26214400
```

**How to generate AUTH_SECRET:**
- Open https://generate-secret.vercel.app/32 in new tab -> Click Generate -> Copy -> Paste
- Do it **twice** (one for AUTH_SECRET, one for CREDENTIAL_ENCRYPTION_KEY - must be different)

8. Go to **Settings** tab -> **Generate Domain** -> Click it -> You get URL like `https://ufms-business-management-suite-production.up.railway.app`

9. **COPY IT** -> Save in Notepad. This is your **Backend URL**.

10. Click **Deploy** (top right) -> Wait 3-4 minutes -> Status becomes **Active** (green)

**Test Backend:**
Open in Chrome: `https://YOUR_BACKEND_URL/api/v1/health`
Should show: `{"status":"ok"}` or similar
Open: `https://YOUR_BACKEND_URL/api/docs`
Should show Swagger API docs

**If deploy fails:** Click **View Logs** -> See error -> Usually `DATABASE_URL` typo. Check Neon URL has `?sslmode=require` at end.

---

## STEP 4: Deploy Frontend on Vercel (2 min) - Most Graphical Frontend

Vercel is fastest for React, with Preview Links.

1. Go to **https://vercel.com** -> **Sign Up with GitHub** (1 click)
2. Click **Add New...** -> **Project**
3. You will see your GitHub repos -> Find `ufms-business-management-suite` -> Click **Import**
4. Vercel shows settings -> Fill:

   - **Framework Preset:** Vite (auto-detected)
   - **Build Command:** Leave as `npm install && npm --workspace apps/web run build` (we already set in vercel.json)
   - **Output Directory:** `apps/web/dist`
   - **Install Command:** `npm install`

5. Click **Environment Variables** -> Add:

```
VITE_API_URL = https://YOUR_BACKEND_URL.up.railway.app
```
Paste the Railway backend URL from Step 3 (without trailing slash)

6. Click **Deploy** -> Wait 2-3 minutes -> You get URL like `https://ufms-business-management-suite.vercel.app`

**COPY IT** -> This is your **Frontend URL**.

7. Now **UPDATE Railway** with correct frontend URL:
   - Go back to Railway -> Your Backend Service -> **Variables** -> Edit `CORS_ORIGINS` -> Change to `https://your-frontend.vercel.app` (your real Vercel URL)
   - Railway auto-redeploys (30 sec)

**Test Frontend:**
Open `https://YOUR_FRONTEND.vercel.app` -> Login page appears!
Login with: `admin@ufms.local` / `Admin@123`
After login, you should see Dashboard.

**Update Database with Admin User:**
If login fails ("Invalid credentials"), your DB is empty. We need to seed it:

- In Railway -> Your Backend Service -> **Settings** -> **Run a command** OR use Railway CLI:
```bash
# In VS Code Terminal on Windows, install Railway CLI:
npm install -g @railway/cli
railway login
railway link
# Choose your project
railway run npm run db:seed
```

Easier alternative: In Neon dashboard -> Click **SQL Editor** -> Paste and Run:
```sql
-- Check if tables exist
SELECT * FROM tenants LIMIT 1;
```
If error "relation does not exist", Railway didn't run migrations. Go to Railway -> **Deployments** -> Click latest -> **Redeploy**.

---

## STEP 5: Test Everything (1 min)

1. **Frontend:** Open `https://YOUR_FRONTEND.vercel.app` -> Login as admin -> Go to **Platform** (Crown icon) -> **Create Tenant**
   - Name: `Test Company`
   - Slug: `testco`
   - Email: `test@testco.com`
   - Click Create

2. **Tenant Login:** Logout -> Login with new tenant credentials (check Railway logs for temp password or set via seed)

3. **Create Lead:** Go to **Leads** -> **New Lead** -> Fill -> Save -> Should appear in list

4. **Suspend Test:** Go to **Platform** -> Find `Test Company` -> **Suspend** -> Enter reason -> Confirm -> Try login as that tenant -> Should get `403 TENANT_SUSPENDED`

If all 4 work, **you are done!**

---

## DAILY WORK: How to Make Changes (30 sec - Graphical)

**You are on Windows in VS Code. You changed Lead page color to blue:**

1. Edit `apps/web/src/pages/Leads.tsx` -> Save

2. In VS Code Terminal:
```bash
git add .
git commit -m "made leads blue"
git push
```

3. **Magically:**
   - **Vercel Dashboard:** Go to https://vercel.com/dashboard -> Click your project -> You see new deployment `made leads blue` -> Click **Visit** -> **Preview URL** `https://yourapp-git-made-leads-blue.vercel.app` -> See your blue change BEFORE live users see it -> If good, click **Promote to Production** (1 click)
   - **Railway Dashboard:** https://railway.app/dashboard -> Click backend -> See **Deploying...** -> **Active** -> Live graphs show CPU -> Click **View Logs** -> See `Build success`
   - No terminal needed on server!

4. **If change breaks:** In Vercel, click previous deployment -> **Rollback** -> Back in 5 seconds.

**This is why Vercel+Railway is best for you - everything is graphical, 1-click, with preview.**

---

## HOW TO EXPAND (No Code Change)

| Users | What to Do | Cost | Time |
|-------|-----------|------|------|
| **0-50** | Free tiers (Vercel free + Railway free $5 credit + Neon 0.5GB) | **₹0/month** | Now |
| **50-500** | Railway -> Click **Upgrade to Pro** -> $5/month <br> Neon -> **Upgrade to Scale** $19/month | **₹2000/month** | 1 click |
| **500-5000** | Railway slider: 0.5GB -> 2GB RAM <br> Add Redis: Railway -> **New -> Database -> Redis** -> Copy `REDIS_URL` -> Paste in Railway Variables | **₹4000/month** | 2 clicks |
| **5000+** | Add Cloudflare CDN in Vercel (1 click), Neon Autoscaling on | **₹8000/month** | Still no code change |

**Need Payments/Email?**
- Railway -> Variables -> Add `STRIPE_WEBHOOK_SECRET` -> Paste from Stripe dashboard
- Railway -> Variables -> Add `SMTP_HOST`, `SMTP_USER` -> Done
- Your code already handles it (billing.service.ts)

---

## CUSTOM DOMAIN (YourCompany.com)

When ready to use `www.yourcompany.com` instead of `vercel.app`:

1. Buy domain: **GoDaddy / Namecheap / Hostinger** (~₹800/year) -> Search `yourcompany.com` -> Buy

2. **Vercel:** Dashboard -> Your Project -> **Settings** -> **Domains** -> Add `www.yourcompany.com` -> It shows DNS records like `CNAME cname.vercel-dns.com`

3. **GoDaddy:** My Products -> DNS -> Add CNAME with that value

4. Wait 5-10 min -> https://www.yourcompany.com works with auto HTTPS (free SSL)

5. **Railway Backend:** Settings -> **Custom Domain** -> Add `api.yourcompany.com` -> Add same CNAME in GoDaddy -> Update Vercel env var `VITE_API_URL` to `https://api.yourcompany.com` -> Redeploy

---

## TROUBLESHOOTING - Windows

| Error | Fix (Graphical) |
|-------|-----------------|
| `git push` asks for password | GitHub -> Settings -> Developer Settings -> Personal Access Token -> Generate -> Use token as password |
| Vercel build fails | Vercel Dashboard -> Deployment -> View Build Logs -> Usually `npm install` error -> Check `vercel.json` exists in GitHub |
| Railway deploy fails | Railway -> Logs -> Search `DATABASE_URL` -> Check Neon URL has `?sslmode=require` |
| Frontend shows blank | Vercel -> Settings -> Environment Variables -> Check `VITE_API_URL` is Railway URL (no trailing `/`) |
| Login fails | Neon -> SQL Editor -> Run `SELECT * FROM users;` -> If empty, need `railway run npm run db:seed` |
| `403 TENANT_SUSPENDED` | Vercel Frontend -> Platform -> Find tenant -> **Activate** |
| Preview works, Production doesn't | Vercel -> Deployments -> Click Preview -> **Promote to Production** |

---

## WHAT ABOUT OTHER FREE HOSTING?

You asked for other options - Here they rank for YOU:

1. **Vercel+Railway+Neon (THIS GUIDE)** - **#1 Best for you** - Most graphical, easiest, best preview
2. **Render All-in-One** - Good but sleeps, less graphical, no preview links
3. **Netlify+Supabase** - Same as Vercel+Neon, Supabase has even better DB dashboard (alternative to Neon)
4. **Oracle Cloud Free** - Most powerful free forever (24GB RAM), but 30 min setup, not graphical, need Linux knowledge - Only for later when you have 1000+ users

**Stick to this guide. It's the most comfortable for Windows beginners who want to expand big.**

---

## ALL FILES WE CREATED FOR YOU

Check in VS Code:

- `vercel.json` (root) - Tells Vercel how to build frontend
- `railway.json` + `nixpacks.toml` - Tells Railway how to build backend
- `Dockerfile` - For later if you move to VPS/Fly.io (no action now)
- `.env.example` - Updated with Neon/Railway/Vercel vars
- This guide: `docs/DEPLOY_VERCEL_RAILWAY_NEON_WINDOWS.md`

**You are ready. Do Steps 1-5 now. Tell me which step you are stuck on, I will help with exact screenshot text.**

