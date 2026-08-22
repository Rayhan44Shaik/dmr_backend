# API Rules

Always use the shared Axios client.

Never create another Axios instance.

Never use fetch().

Backend is the source of truth.

Never use localStorage for business data.

Every CRUD operation must:

1. Validate input
2. Call backend
3. Refresh latest data
4. Handle loading
5. Handle retry
6. Handle network failure

Never generate frontend IDs.

Always use IDs returned by PostgreSQL.

All mutations must go through backend APIs.

Handle HTTP status:

200

201

400

401

403

404

409

500

Display meaningful user messages.

Never silently ignore API failures.