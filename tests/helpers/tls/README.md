# Test-only TLS fixtures

Self-signed certificate authority and server certificate used **only** by
`tests/helpers/fakeSmtp.ts` so the mail tests can exercise a real TLS handshake
against a local socket. Nothing here is a secret or is used by the application:

- `ca.pem` – test CA; tests pass it via `SMTP_TLS_CA_FILE` so the client trusts
  the local server in addition to the system roots.
- `server.pem` / `server.key` – leaf certificate for `localhost` /
  `127.0.0.1`, valid for 3650 days.

The production transport never trusts these files unless an operator explicitly
points `SMTP_TLS_CA_FILE` at a bundle of their own.
