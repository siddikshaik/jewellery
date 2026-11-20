---
name: access-control
description: Sign-in, roles, stores and permissions in the jewellery billing app. Use when adding an endpoint, a screen, a button or a collection that some roles must not reach, changing what a role can do, or touching passwords, sessions or the super admin monitor view.
---

# Access control

## Model

- `data/platform/users.json`: `{id, username, name, role, storeId, perms, active, passwordHash}`. Roles: `superadmin` (no store), `admin` (one store), `user` (one store, `perms` = `{invoices, customers, inventory, purchases}` each `none|view|edit`).
- `data/platform/stores.json`: `{id, name, active, license:{plan, expiresAt, maxUsers, note}}`. Inactive store = its people cannot sign in and existing sessions stop working (checked on every request in `currentUser()`).
- Session: cookie `jb` = base64url payload `{u: userId, exp}` + `.` + HMAC-SHA256 with `data/platform/secret.key`. HttpOnly, SameSite=Lax, 12 hours, `Secure` when the request came over HTTPS. The user record is re-read on every request, so role changes, switch-offs and password changes take effect immediately.
- Passwords: scrypt with a random salt (`server/auth.js`). Login always runs a hash comparison (a dummy one for unknown users) and is throttled per username and address.

## Licence, seats, sign-up, contact details

- `licenseOf(store)` in `server/api.js` computes `expired`, `daysLeft`, `usedUsers` from the stored `license`. **Expired = read-only**: store-data PUT/DELETE and user create / re-enable return 403 `license_expired`; the super admin is exempt. Seat limit: `seatProblem()` returns 403 `user_limit` when turned-on people have reached `maxUsers` (owner included).
- The browser mirrors it: `licenseLocked()` caps `level()` at view, `seatInfo()` drives the Add user button, `licenseBannerHTML()` the banner, `refreshMe()` re-checks every poll (20 s).
- `POST /api/auth/signup` makes a store and its owner (`role: 'admin'`) with a one-month trial and 2 users; limited to 5 per hour per address; `SIGNUP=off` or `createApp({signupOpen:false})` disables it; refused until a super admin exists.
- Email and phone: `checkContact()` (new accounts: required) and `applyContact()` (edits: cannot blank a value that exists). Unique across all accounts after normalising. Login accepts username, email or phone.
- Only the super admin edits licences (`PATCH /api/stores/<id>`), via `applyLicense()`.

## The one place that decides

`level(user, area)` in `server/api.js` returns 0 none, 1 view, 2 edit. Areas: `invoices`, `customers`, `inventory`, `purchases`, `settings`, `users`, `stores`. `AREA_OF` maps each collection to its area (`suppliers` and `purchases` are the `purchases` area; `rates` is `settings`). `ROUTE_AREA` in the browser may list several areas for one route (analytics: any of invoices, purchases, inventory).

| Role | invoices / customers / inventory | settings (and rates) | users | stores |
| --- | --- | --- | --- | --- |
| superadmin | 1 (view, only with `?store=`) | 1 | 2 | 2 |
| admin | 2 | 2 | 2 (own store, store users only) | 0 |
| user | from `perms` | 0 | 0 | 0 |

`canRead(user, collection)`: settings always; rates if invoices, inventory or purchases is readable; customers if customers or invoices; the rest by their own area. `canWrite` needs level 2 and never for a super admin. The browser mirrors this in `level()` / `can()` in `src/js/auth.js`; keep the two in step.

## Adding something

1. Server first: put the check in `server/api.js` (use `me`, never ids from the body; for a store route use `targetStore(me, url)`).
2. Add a case to `test/api.js` for the role that must be refused and the one that must pass.
3. Then the browser: gate buttons with `can(...)`, guard the route in `ROUTES.x.html` (`if(!can('x','edit')){go('x');return null}`), add it to `ROUTE_AREA` and `navList()`.
4. Super admin monitoring is `monitor` in the browser (no saving, `can()` returns view only). Forms for a read-only person are disabled with `lockFields()` (settings) or simply not rendered.

## Rules of thumb

- A UI check is a courtesy; the API check is the control.
- Never return `passwordHash`; use `pub(user)`.
- A store admin may only create and edit `role: 'user'` in their own store; the server forces `storeId` and `role`.
- Do not delete users or stores from the app; turn them off.
- Lost super admin password: `node scripts/reset-password.js <username> <new password>`.
