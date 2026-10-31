# CampusConnect

A comprehensive student social and academic community platform built on the **MERN** stack. It uses a **Feature-Based (Modular) Architecture** to ensure scalable, maintainable, and highly cohesive code across both the frontend and backend.

Everything a visitor sees is real data or a designed empty state. There are no seeded records the app quietly leans on, and nothing on any screen is hardcoded mock data.

---

## 🌟 Features

- **Authentication & Security:** JWT-based access tokens with `httpOnly` refresh cookies. Single-use email verification tokens.
- **Social Feed & Posts:** Create posts, vote in polls, like, comment, and save posts.
- **Academic Discussions:** Dedicated modules for course discussions and student Q&A.
- **Groups & Events:** Join student groups, create events, and register for campus activities.
- **Direct Messaging:** Real-time chat with other students using Socket.io.
- **Notifications:** Real-time notifications for likes, follows, comments, and mentions.
- **Directory & Search:** Robust search for students, groups, and posts across the campus.
- **Media Uploads:** Cloudinary integration with seamless local-disk fallbacks.

---

## 🛠 Tech Stack

**Frontend (Client)**
- **Framework:** React 18 with Vite
- **Styling:** Tailwind CSS v4
- **State Management:** Zustand (Global State) + TanStack React Query v5 (Server State)
- **Routing:** React Router v6
- **Forms:** React Hook Form

**Backend (Server)**
- **Runtime:** Node.js (v20+)
- **Framework:** Express.js
- **Database:** MongoDB with Mongoose
- **Validation:** Zod
- **Real-time:** Socket.io
- **Security:** bcryptjs, helmet, express-rate-limit

---

## 🏗 Architecture & Folder Structure

We recently migrated from a traditional layered MVC to a **Feature-Based Modular Architecture**. This means code is grouped by feature (e.g., `users`, `posts`, `messages`) rather than by technical role (e.g., all controllers together).

```text
campus-connect/
├── client/
│   ├── src/
│   │   ├── app/              # Global providers, routing configuration
│   │   ├── features/         # Feature modules (auth, users, posts, messages, etc.)
│   │   │   └── {feature}/
│   │   │       ├── components/
│   │   │       ├── pages/
│   │   │       └── services/
│   │   ├── components/       # Shared UI (Button, Modal, Toast, Layouts)
│   │   ├── hooks/            # Shared global hooks
│   │   ├── services/         # Axios config, core API endpoints
│   │   └── store/            # Global Zustand stores
│   └── package.json
└── server/
    ├── src/
    │   ├── modules/          # Feature domains (auth, users, groups, events, etc.)
    │   │   └── {module}/
    │   │       ├── *.model.js
    │   │       ├── *.controller.js
    │   │       ├── *.service.js
    │   │       └── *.routes.js
    │   ├── infrastructure/   # Database, Mail, Storage services
    │   ├── shared/           # Cross-module utilities, errors, validators
    │   ├── middleware/       # Auth, Upload, RateLimit, ErrorHandler
    │   └── server.js
    └── package.json
```

---

## 🚀 Quick Start

### 1. Requirements
- **Node ≥ 20**, npm ≥ 10
- **MongoDB** running locally or via Atlas.

### 2. Installation
Clone the repo and install dependencies for both workspaces:
```bash
git clone <repo> && cd campus-connect
npm install
```

### 3. Environment Variables
Copy the `.env.example` in the server:
```bash
cp server/.env.example server/.env
```
Generate JWT secrets and add them to `.env`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Run Development Servers
```bash
npm run dev
```
- API starts on `http://localhost:5050`
- Vite frontend proxy starts on `http://localhost:5173`

*(Optional) To seed demo data:*
```bash
npm run seed
```

---

## 🧪 Testing

The backend includes robust smoke tests and e2e testing.

```bash
npm test              # Everything: the isolated suite run, then the empty-DB journey
npm run test:isolated # 6 suites against one throwaway instance (own port + database)
npm run test:api      # 173 API assertions
npm run test:notifications  # 52 Notification assertions
npm run test:empty-db       # 75 end-to-end assertions from an empty DB
```

`npm test` boots its own API instance on port 5096 against a database it drops
first, with `NODE_ENV=test`. Nothing needs to be running beforehand, and the run
cannot be disturbed by whatever is on your dev server.

That isolation is deliberate. The suites register accounts, and registration is
rate limited per IP, so pointing them at a long-lived dev server meant a few
consecutive runs exhausted the bucket and the suites failed on a misleading
`TypeError`. They are also given a `SERVER_URL` matching the test port, since
upload URLs are minted from it rather than from the incoming request.

Individual suites accept a target, so you can run one against a specific
instance:

```bash
cd server && node scripts/smoke.js http://localhost:5096/api
```

---

For deeper architectural guidelines, database index rules, and contribution guides, see [DOCUMENTATION.md](./DOCUMENTATION.md).
