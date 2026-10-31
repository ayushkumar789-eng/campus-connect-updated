# Frontend structure

Feature-based. Every unit of code lives either inside the feature that owns it, or
in one of two explicitly shared folders. There are no type-based folders left.

```
src/
  app/          Application shell and routing — not a feature
    layout/       AppShell, Sidebar, Topbar, RightRail, Guards, navItems
    pages/        Route-level pages that belong to no feature (NotFound, Unauthorized, PhaseStub)
    store/        App-wide UI state (uiStore)
  features/     One folder per domain feature
    auth/  posts/  groups/  messages/  events/  notes/
    discussions/  comments/  notifications/  saved/  search/  users/
  shared/       Code that genuinely spans features
    api/          HTTP client (client.js) and the endpoint registry (endpoints.js)
    hooks/        Cross-feature hooks (useData, useDebounce)
    ui/           Design-system primitives (Button, Card, Modal, Dropdown, …)
    utils/        Pure helpers (format)
```

## The rule

**A file goes in the folder of the thing it is about.**

- `features/posts/components/PostCard.jsx` — a post card belongs to posts.
- `features/messages/store/chatStore.js` — conversation state belongs to messages,
  even though `app/layout/AppShell.jsx` reads the unread count from it. The shell
  consuming a feature's state does not move the state out of the feature.
- `shared/ui/Button.jsx` — a primitive no single feature owns.

If a file is imported by two or more features and is not a UI primitive, it belongs
in `shared/`. If it is imported by exactly one feature, it belongs in that feature,
no matter how "generic" it looks.

## Feature folders

Each feature is a vertical slice and may contain:

```
features/<name>/
  components/   Feature-specific UI
  pages/        Route targets
  hooks/        Feature-specific hooks
  services/     API calls for this feature
  store/        Feature-specific state
  index.js      The feature's public API
```

Not every feature needs every subfolder — `features/saved/` has only `pages/`.
Add a subfolder when a second file of that type appears, not before.

### Barrels

`features/<name>/index.js` is the feature's public API. Other features import
through it rather than reaching into the feature's internals:

```js
import { useAuthStore } from '../../features/auth/index.js';
```

**Pages are the exception.** Route targets are imported directly by `App.jsx` so
they stay lazy-loaded. A barrel that statically re-exported its pages would pull
every page into the main chunk and undo the code split — which is exactly how a
`ProfileSetup` re-export used to cost 12.59 kB of main-bundle weight. Barrels
export services, stores and components; pages are reached by their own path.

## Adding a feature

1. Create `features/<name>/` with the files it needs.
2. Add an `index.js` exporting its public API.
3. Register its routes in `App.jsx` and its nav entry in `app/layout/navItems.js`.
4. If it needs a new API call, add it to `features/<name>/services/` and re-export
   it from the feature barrel — `shared/api/endpoints.js` aggregates them.

## What moved here, and why

The tree used to be hybrid: twelve `features/` folders alongside type-based
`components/`, `pages/`, `hooks/`, `services/`, `store/` and `utils/` folders at the
top level. That split the same concern across two places — `features/auth/` had
its own `pages/` and `services/`, while `features/groups/` had `components/` and
`pages/` but no barrel at all.

The restructure moved the leftovers into `app/` or `shared/` and normalised the
feature folders. It was verified to change **only import paths**: 83 of 84 files
are byte-identical once their specifiers are normalised to module identities, and
the one exception is an unrelated bug fix. See `PRODUCTION_READINESS.md` for the
verification method.
