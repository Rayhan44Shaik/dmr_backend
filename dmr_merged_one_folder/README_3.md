# Frontend API foundation

Axios-based HTTP layer for the local backend (`http://localhost:4000/api`).

| File | Role |
|------|------|
| `config.ts` | Base URL / timeout |
| `client.ts` | Axios instance + request/response interceptors |
| `helpers.ts` | `apiGet` / `apiPost` / `apiPut` / `apiPatch` / `apiDelete` / `apiTryGet` |
| `errors.ts` | `ApiError`, `handleApiError`, `toApiError` |
| `types.ts` | Shared transport types |
| `index.ts` | Public exports |

**Not wired to UI or localStorage yet** — import from `src/api` when migrating services later.

```ts
import { apiGet, handleApiError } from "../api";

try {
  const { data } = await apiGet("/health");
} catch (e) {
  const message = handleApiError(e);
}
```
