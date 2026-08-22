# DMR Poultries Frontend + Local Backend

Poultry logistics ERP (React + Vite + Electron) with a new **Phase 1 local PostgreSQL backend**.

## Frontend

```bash
npm install
npm run dev
```

## Backend (PostgreSQL — Masters + Trip Steps 1–5 + Staff)

See [`backend/README.md`](./backend/README.md).

```bash
# PostgreSQL must be running locally (or: cd backend && docker compose up -d)
npm run backend:install
npm run backend:migrate
npm run backend:seed   # optional
npm run backend:dev    # http://localhost:4000
```

### Phase plan

1. **Now** — Local PostgreSQL schema + REST API through Staff
2. **Next** — Mobile app talking to this local API/DB
3. **Later** — Move database + mobile clients to cloud (`DATABASE_URL` swap)
