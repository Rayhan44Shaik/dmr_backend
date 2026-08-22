# Supervisor Mobile Trip Entry — Phase 2

This application area is isolated at `/mobile/trips`. It imports the existing Step 1–5 presentation and validation components but does not use the existing ERP authentication or unprotected Trip endpoints.

## Runtime path

```text
Supervisor Mobile PWA
  → IndexedDB working copy + durable operation queue
  → VITE_MOBILE_API_BASE_URL (HTTPS in production)
  → /api/mobile authenticated namespace
  → existing backend Trip service
  → PostgreSQL transaction
```

## Production configuration

```env
VITE_MOBILE_API_BASE_URL=/api/mobile
```

Use a same-origin HTTPS reverse proxy path where possible. An absolute URL is accepted only when it is HTTPS. Never configure a deployed phone with `localhost` or a PostgreSQL address.

Local development login (created on first sign-in after `npm run db:migrate` in `backend`):

- Username: `RuhullaShaik`
- Password: `Supervisor@123`
- URL: `http://localhost:5173/mobile` or `http://localhost:5173/mobile/trips`

The queue retains `PENDING`, `SYNCING`, retryable failure, conflict, and permanent-failure records until an authoritative operation acknowledgement is durably recorded. A request retried after a response loss reuses the same UUID.
