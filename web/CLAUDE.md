# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun dev          # dev server
bun build        # production build
bun lint         # biome check
bun lint:fix     # biome check --write (auto-fix)
bun format       # biome format --write
bun generate     # plop interactive (pick generator)
bun generate:service   # plop service (only service)
bun generate:crud      # plop crud-page (service + pages)
```

No test suite configured. No test commands exist.

`bun lint:fix` has no ignore list: it rewrites generated/tooling files and can bury the real diff. Prefer `bunx biome check <paths touched>`.

## Environment

Required in `.env`:
```
VITE_API_URL=https://...   # validated by Zod at startup; app throws if missing/invalid
```

Screen titles are written by hand (`index.html`, `Helmet` per page), never read from the environment: `.env` is not versioned, so nothing in the repo would guarantee the value.

## Architecture

**Runtime:** React 19 + Vite (rolldown-vite) + Tailwind v4 + Biome (linter/formatter). Package manager is **bun**.

**Routing — file-based, auto-generated.** The Vite plugin `plugins/vite-plugin-convention-routes.js` scans `src/pages/` and writes `src/generated/routes.jsx` at build/dev start. **Never edit `src/generated/routes.jsx` directly.**

File → route conventions:
- `src/pages/foo/bar/index.jsx` → `/foo/bar`
- `src/pages/foo/bar/[id].jsx` → `/foo/bar/:id`
- Folders named `(auth)` or `(public)` are **invisible groups** (no path segment added)
- `layout.jsx` in any folder wraps children via React Router's `<Outlet>`
- `error.jsx` in any folder becomes the `errorElement`
- `loading.jsx` in any folder is used as Suspense fallback for that subtree
- Files matching `**/components/*.jsx` are excluded from routing
- A page declares the permission its route needs with a **one-line export** read by the plugin at build time; the generated route element is wrapped in `<PermissionRoute>` **outside** the `Suspense`, so a denied page never downloads its chunk and never runs a hook:

```jsx
export const permissao = 'etapas:read'
// or, to require every permission in the list:
export const permissao = ['cards:read', 'users:read']
export const permissaoTodas = true
```

  The plugin also emits `rotaPermissoes` (route URL → permission) into `src/generated/routes.jsx`, which is what the sidebar reads — the same question is answered in one place. A page that still contains `<PermissionRoute>` in its JSX **fails the build**: two gates for one route is how the pre-build behaviour (query fires, then redirect) comes back unnoticed.

**Auth flow — cookie httpOnly, no token in JS.**
- `src/pages/(auth)/layout.jsx` wraps all auth-required routes in `<ProtectedRoute>` + `<AppLayout>`
- `src/contexts/auth-context.jsx` provides `useAuth()`, `useAuthUser()`, `useAuthPermissions()`, `useAuthRoles()`, `useHasPermission()`, `useHasRole()`
- The API signs the JWT into an httpOnly cookie on `POST /seguranca/auth/session` and never returns it in the body. There is nothing to store, send, or clear. `withCredentials: true` on the axios instance is what makes the browser send it; the web origin must be in the API's `CORS_ORIGIN` (exact match — `*` is rejected once credentials are involved).
- "Am I logged in?" is not a local flag: it is whatever `GET /seguranca/auth/session` answers. The session query is **never persisted** (`dehydrateOptions` in `src/lib/react-query.js`) — a mirror of the cookie kept in localStorage would let the app open "logged in" with a dead credential. It also refetches on window focus (`refetchOnWindowFocus: 'always'` in `useSession`): the cookie can expire or be revoked while the tab sits idle, and coming back to the tab is when the person is about to act on the screen.
- Logout is `DELETE /seguranca/auth/session`; only the server can delete an httpOnly cookie. `useLogout` then drops the cache (`removeQueries` + `persister.removeClient()` — the persisted snapshot in localStorage would otherwise keep the previous user's responses) and writes `sessao:encerrada` in localStorage. That key is only a signal to the **other** tabs: the `storage` listener in `AuthProvider` drops their session too. Without it the tab that did not click "Sair" kept rendering the protected screen from cache with a cookie that no longer existed.
- Every guard sends the intended route along: `ProtectedRoute`/`PermissionRoute`/`RoleRoute` navigate to `/auth?returnTo=<rota>` and the 401 handler in `src/lib/react-query.js` does the same via `window.location`. `src/lib/return-to.js` builds and reads that param and rejects anything that is not an internal path — `returnTo=https://…` in a crafted link would be an open redirect. Login lands on `returnTo` or `/`.
- Cookie is `SameSite=Lax`. Web and API must be same-site in production, otherwise set `COOKIE_SAMESITE=none` in the API **and** add an anti-CSRF token — `Lax` is what stands in for one today.

**Permission gate:** `src/lib/permissions.js` (`temPermissao` / `temPermissoes`) mirrors `checkPermissionMatch` from the API. Gate routes with `export const permissao` (see Routing above) — never with `<PermissionRoute>` inside the page — and never invent a different matching rule: a front that disagrees with the back either shows links that 403 or hides screens the user can open.

**Menu:** `src/layout/components/app-sidebar.jsx` holds the sidebar data. `NavMain` hides items by the permission the **destination page** declares (`rotaPermissoes`), so the menu never repeats the answer. `resolveRotaInicio()` (`src/lib/rota-inicio.js`) picks the post-login landing route.

**Data fetching — `createBaseService` factory.**
All CRUD services are created via `src/services/base/createBaseService.js`:

```js
// src/services/usuarios.js
import { createBaseService } from 'src/services/base/createBaseService'
export const {
  useList, useListAll, useGet,
  useCreate, useUpdate, useDelete,
  keys, api,
} = createBaseService('/seguranca/usuarios', 'usuarios')
```

Each service exposes React Query hooks (`useList`, `useGet`, `useCreate`, `useUpdate`, `useDelete`) and raw `api.*` methods. `useCreate`/`useUpdate`/`useDelete` automatically invalidate the entity's query keys on success.

Filter params for `useList`: `{ page, pageSize, term, fields, order, orderDirection, fspecifics, select }`. `fspecifics` format: `"campo$valor"` or array of those.

**UI components:** shadcn/ui components in `src/components/ui/`. Do not modify these directly — they are the primitive layer.

**`GenericTable`** (`src/components/table/table.jsx`): TanStack Table wrapper. Props: `data`, `headers`, `rowActions`, `selectableRows`, `pagination`. Pagination modes: local, manual (`onPaginationChange`), or URL-managed (`manageUrlState: true`).

**`Form`** (`src/components/Form/FormWeb.jsx`, default export): Declarative dynamic form. A `fields` array of objects drives rendering; the Zod schema and default values are auto-generated by `src/components/Form/buildFormSchema.js` (pass `schema` to override). Field types: text/email/password/tel/number, currency, date/datetime, boolean/switch/checkbox, radio, picker/searchPicker, checkboxGroup, fieldArray, label/button/custom/hidden. Conditional visibility via declarative `visibleIf` ({field, operator, value}) — hidden fields don't trigger `required`. `number`/`currency` are coerced to numbers on submit. Field components live in `src/components/Form/FormFieldsWeb/`. See `docs/FORM_README.md`.

**State:** Jotai atoms in `src/lib/atoms.js`. React Query for server state with persistence via `@tanstack/react-query-persist-client`.

**Code generation:** Running `bun generate:crud` creates service + index + `[id]` pages under `src/pages/(auth)/<routePath>/`. After generating, add the route to the sidebar (`src/layout/components/app-sidebar.jsx`) and adjust table headers and form fields in the generated files.

## Code Style

Biome enforces: tabs, single quotes, no semicolons, JSX single quotes. Import organization is automatic. Path alias `src/` maps to `/src/`.
