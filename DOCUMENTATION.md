# CampusConnect - Technical Documentation

This document provides a deep dive into the engineering decisions, architecture, and standards of the CampusConnect project.

## 1. Feature-Based Architecture

We use a **vertical slice** (feature-based) architecture.

### Backend (`server/src/modules/`)
Instead of grouping all models, controllers, and services together, we group them by **domain**.
For example, the `posts` module contains:
- `Post.model.js` (Mongoose Schema)
- `posts.service.js` (Business logic)
- `posts.controller.js` (HTTP Request/Response handling)
- `posts.routes.js` (Express Router wiring)

**Rules:**
1. Modules should be highly cohesive and loosely coupled.
2. If module A needs data from module B, A should import B's **service**, not B's model.
3. Cross-cutting concerns (email, file storage) belong in `src/infrastructure/`.

### Frontend (`client/src/features/`)
Similarly, the frontend groups Pages, Components, and API calls by feature.
- `features/users/` (Profile pages, user specific components)
- `features/messages/` (Chat windows, message specific services)

**Rules:**
1. Features should not depend on other features' internal components.
2. Generic components (Buttons, Inputs, Layouts) belong in the root `client/src/components/`.
3. Global state goes to `client/src/store/`. Feature-specific state stays within the feature.

---

## 2. API Envelope & Error Handling

Every API response follows a strict, predictable JSON envelope.

**Success Envelope:**
```json
{
  "success": true,
  "data": { ... },
  "pagination": { "nextCursor": "...", "hasNextPage": true }
}
```

**Error Envelope:**
```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Invalid input" },
  "errors": [
    { "field": "email", "message": "Must be a valid email" }
  ]
}
```

**Validation:**
We use **Zod** for all request validations. Unknown fields are strictly rejected using `.strict()` to prevent payload injection.

---

## 3. Authentication & Security

- **Tokens:** We use short-lived JWT Access Tokens (15m, stored in memory) and long-lived Refresh Tokens (7d, stored in an `httpOnly` cookie).
- **Token Revocation:** Tokens carry a `ver` (version) claim. Bumping the user's `tokenVersion` in the DB instantly invalidates all outstanding tokens, making "sign out everywhere" instantaneous.
- **Passwords:** Hashed with bcrypt.
- **Rate Limiting:** Login attempts, registration, and password reset endpoints have strict rate limiters keyed by IP or user identifier.

---

## 4. Database & Queries

- **Indexes:** `syncIndexes()` is executed at boot. Indexes are load-bearing for uniqueness (e.g., no duplicate follows or emails).
- **Pagination:** We exclusively use **cursor-based pagination** (using monotonic `_id` tracking) instead of offset-based pagination. This prevents skipped or duplicated rows in highly concurrent feeds.
- **Soft Deletions/Anonymization:** When a user deletes their account, their posts and comments are **not deleted**. They are reassigned to a `departed_student` tombstone. This prevents massive cascading deletions that would ruin conversation threads for active users.

---

## 5. React Query & State

- **Query Keys:** Keys are treated as namespaces. E.g., `['posts', 'feed']` and `['posts', 'saved']`.
- **Mutations:** We perform optimistic UI updates on actions like Liking or Saving a post. If the mutation fails, we roll back the cache automatically using React Query's `onMutate` context.

---

## 6. Real-time Communication (Sockets)

- Socket.io is used for real-time `messages` and `notifications`.
- Sockets authenticate using the same JWT Access Token strategy.
- Emitted events are namespaced (e.g., `message:new`, `notification:read`).
