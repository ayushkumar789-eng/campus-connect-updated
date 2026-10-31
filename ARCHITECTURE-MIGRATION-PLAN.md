# ARCHITECTURE MIGRATION PLAN

## 1. Overview
The goal of this migration is to transition the Campus Connect application from a monolithic MVC layer-based architecture to a **Feature-Based (Modular) Architecture** for both the frontend and backend. This will independently scale business features, enforce strict boundaries (high cohesion, low coupling), and make the application easier to maintain without breaking the existing API contract, tests, or features.

---

## 2. Current Structure
### Backend
The backend currently separates concerns horizontally by type:
- `server/src/controllers/` (All route handlers)
- `server/src/services/` (All business logic)
- `server/src/models/` (All Mongoose models)
- `server/src/routes/` (All endpoint definitions)
- `server/src/validators/` (All schema/validation logic)
- `server/src/utils/`, `config/`, `middleware/`

### Frontend
The frontend separates concerns similarly:
- `client/src/pages/` (Page components separated by domain folders)
- `client/src/components/` (Components separated by domain folders)
- `client/src/services/` (API calls)
- `client/src/store/` (State management)
- `client/src/hooks/`, `layouts/`, `utils/`

---

## 3. Target Structure
### Target Backend
```text
server/src/
├── modules/
│   ├── auth/          (auth.controller, auth.service, token.service, auth.routes)
│   ├── users/         (user.controller, user.service, User.model, user.routes, account.controller)
│   ├── posts/         (post.controller, post.service, Post.model, post.routes)
│   ├── comments/      (Comment.model, comment.routes - separated or merged with posts)
│   ├── groups/        (group.controller, group.service, Group.model, group.routes)
│   ├── events/        (event.controller, event.service, Event.model, event.routes)
│   ├── notes/         (note.controller, note.service, Note.model, note.routes)
│   ├── notifications/ (notification.controller, notification.service, Notification.model, etc.)
│   ├── search/        (search.routes, search.service)
│   └── saved/         (saved.routes, SavedPost.model)
├── infrastructure/
│   ├── database/      (mongoose connection setup)
│   ├── storage/       (storage.service.js)
│   ├── mail/          (email.service.js)
│   └── logging/
├── shared/
│   ├── errors/        (ApiError, error.js)
│   ├── utils/         (fileType.js, etc.)
│   └── validators/    (common zod schemas)
├── middleware/        (auth.js, upload.js, rateLimit.js)
└── app.js / server.js
```

### Target Frontend
```text
client/src/
├── app/               (App.jsx, main.jsx, global providers, routing configuration)
├── features/
│   ├── auth/          (Login/Register pages, auth hooks, auth api services)
│   ├── users/         (Profile pages, User avatar components)
│   ├── posts/         (Feed, PostCard, post api, post hooks)
│   ├── groups/        (Group details, GroupCard, group api)
│   ├── events/        (Event details, EventCard, event api)
│   ├── notes/         (Notes list, Note composer)
│   ├── notifications/ (Notification panel, badge hooks)
│   └── search/        (Search input, search pages)
├── components/        (Shared UI: Button, Modal, Input, Toast, Layouts)
├── hooks/             (Shared global hooks)
├── lib/               (Shared clients e.g. axios interceptors, react-query client)
├── utils/             (format.js, helpers)
└── assets/ / styles/  (index.css)
```

---

## 4. File Mapping (Backend Example)
| Current Path | Target Path |
| --- | --- |
| `server/src/controllers/group.controller.js` | `server/src/modules/groups/group.controller.js` |
| `server/src/services/group.service.js` | `server/src/modules/groups/group.service.js` |
| `server/src/models/Group.js` | `server/src/modules/groups/group.model.js` |
| `server/src/routes/group.routes.js` | `server/src/modules/groups/group.routes.js` |
| `server/src/services/email.service.js` | `server/src/infrastructure/mail/email.service.js` |
| `server/src/services/storage.service.js` | `server/src/infrastructure/storage/storage.service.js` |
| `server/src/middleware/auth.js` | `server/src/middleware/auth.js` (Remains) |

---

## 5. File Mapping (Frontend Example)
| Current Path | Target Path |
| --- | --- |
| `client/src/pages/groups/*` | `client/src/features/groups/pages/*` |
| `client/src/components/groups/*` | `client/src/features/groups/components/*` |
| `client/src/services/group.api.js` | `client/src/features/groups/services/group.api.js` |
| `client/src/components/ui/Button.jsx` | `client/src/components/ui/Button.jsx` (Remains) |

---

## 6. Dependencies & Import Rules
1. **Vertical Isolation**: Modules in `server/src/modules/*` (or `client/src/features/*`) MUST NOT directly import internal implementations from other modules. They must communicate via public index exports or shared infrastructure.
2. **Infrastructure**: Domain logic (services) calls `infrastructure` (storage, mail) but `infrastructure` never calls `modules`.
3. **Shared Core**: The `shared/` directory is globally accessible but must not depend on `modules/`.

---

## 7. Circular Dependencies & Cross-Feature Imports
**Known Risk Areas:**
- **User/Auth/Account Integration**: `user.service` often imports `auth.service`, and `account.service` ties them together. These must be cleanly separated (or bundled into an `auth` module and `users` module sharing a public boundary).
- **Post & Comments**: `post.service` might orchestrate `comments`. We need to export public methods from `comments` or bundle them.
- **Frontend State**: Zustand stores in `client/src/store` might map to multiple domains. We will split them into feature-specific hooks.

---

## 8. Migration Order
The migration will be executed strictly one feature at a time, testing the complete system after each feature.

1. **Infrastructure & Shared** (Database, Storage, Email, Error Handling, Base UI Components)
2. **Auth Feature** (Backend `auth` module, Frontend `auth` feature)
3. **Users Feature** (Profile, Directory)
4. **Groups Feature**
5. **Events Feature**
6. **Posts & Comments Feature**
7. **Notes Feature**
8. **Notifications Feature**
9. **Search & Saved Features**
10. **Cleanup & Final Orchestration** (Remove dead code, consolidate `app.js` and `App.jsx` routing)

---

## 9. Testing & Risk Mitigation
- After each feature, we will run `npm test`, `test-events.js`, `test-uploads.js`.
- Frontend will be built using `npm run build` after every step.
- Linting will be applied globally to catch missing imports.
- Production environment variables, existing Mongo collections, and file upload validations will not be touched.
