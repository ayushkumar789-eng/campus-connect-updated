# Deploying CampusConnect to Vercel

CampusConnect is configured to deploy directly to **Vercel** with zero data leaks, hardened security headers, and automated environment detection.

---

## Architecture on Vercel

* **Frontend (Vite + React SPA):** Built into `client/dist` and served from Vercel's Edge CDN with client-side SPA routing (`vercel.json` rewrites).
* **Backend API (Serverless Express):** Handled via `api/index.js` which adapts the modular Express REST API into a Vercel Serverless Function answering all `/api/*` endpoints on the exact same origin.
* **Database (MongoDB Atlas):** Connects securely via Mongoose with connection pooling and cached reconnection across serverless invocations.

---

## 🚀 Quick Deployment Guide

### Option 1: One-Click / Git Deployment via Vercel Dashboard

1. **Push your repository** to GitHub, GitLab, or Bitbucket.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Configure the Project:
   * **Framework Preset:** `Vite` (or `Other`)
   * **Root Directory:** `./` (keep at root)
   * **Build Command:** `npm run build`
   * **Output Directory:** `client/dist`
4. Add the **Environment Variables** in the Vercel dashboard (see below).
5. Click **Deploy**.

---

### Option 2: Deploying via Vercel CLI

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Deploy
vercel
```

---

## 🔐 Required Production Environment Variables

Add these in **Vercel Project Settings → Environment Variables**:

| Variable | Description | Example / Instructions |
| :--- | :--- | :--- |
| `NODE_ENV` | Environment mode | `production` |
| `MONGO_URI` | MongoDB Atlas Connection String | `mongodb+srv://<user>:<password>@cluster.mongodb.net/campusconnect?retryWrites=true&w=majority` |
| `JWT_SECRET` | Primary JWT signing key (min 32 chars) | Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | Refresh token signing key (min 32 chars) | Must be different from `JWT_SECRET` |
| `COOKIE_SECURE` | Enforce secure HTTPS-only cookies | `true` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Cloud Name (durable storage) | Your Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | Your Cloudinary API key |
| `CLOUDINARY_API_SECRET`| Cloudinary API Secret | Your Cloudinary API secret |
| `EMAIL_PROVIDER` | Mail transport for password reset/verification | `resend`, `smtp`, `sendgrid`, or `ses` |
| `EMAIL_FROM` | Sender address | e.g. `CampusConnect <no-reply@yourdomain.com>` |
| `RESEND_API_KEY` | If using Resend for email | `re_...` |

*(Note: `CLIENT_URL` and `SERVER_URL` automatically resolve to your Vercel domain `https://<project-name>.vercel.app` if left unset).*

---

## 🛡️ Security & Zero Data Leak Guarantees

1. **No Secrets in Bundles:** Frontend builds are scanned — no API keys, database URIs, or tokens are baked into client JavaScript.
2. **Safe Error Responses:** In production mode, 5xx server errors return generic messages (`"Something went wrong on our end"`). Stack traces, internal paths, and driver errors are suppressed.
3. **Private User Data Protection:** Sensitive model fields (`password`, `tokenVersion`, `email`, verification hashes) are excluded from JSON serialization and query results.
4. **CORS & Cookies:** SameSite and Secure cookies with exact-origin matching; wildcard origins (`*`) are disallowed for credentialed routes. Vercel preview domains (`*.vercel.app`) are supported automatically.

