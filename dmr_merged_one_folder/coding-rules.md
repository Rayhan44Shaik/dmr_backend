# DMR Poultries ERP - Coding Rules

## General Rules

This is a production ERP.

Never generate demo-quality code.

Always think before writing code.

Never overwrite existing UI.

Never redesign screens.

Never rename files unless requested.

Never change folder structure.

Never change routing.

Never create duplicate components.

Always reuse existing components.

Always reuse existing hooks.

Always reuse existing services.

Always reuse existing Axios client.

Never create another Axios instance.

Never use fetch().

Always use async/await.

Never use any.

Prefer strict TypeScript.

Never suppress TypeScript errors.

Never ignore ESLint errors.

------------------------------------

## State Management

Never use localStorage.

PostgreSQL is the only source of truth.

Temporary UI state is allowed.

Business data must always come from backend APIs.

After every successful save:

Reload latest data from backend.

------------------------------------

## API Rules

Always use:

src/services/api.ts

Never create another API client.

Handle:

Loading

Success

Validation

Retry

Error

Timeout

Offline

------------------------------------

## UI Rules

Never redesign UI.

Never change spacing.

Never change typography.

Never change colors.

Never change component hierarchy.

Do not modify CSS unless requested.

Preserve all existing animations.

------------------------------------

## Database Rules

Every save must persist into PostgreSQL.

Never create duplicate records.

Always use existing IDs.

Never generate random IDs on frontend.

Backend owns IDs.

------------------------------------

## Code Style

Small reusable functions.

No duplicated logic.

Meaningful names.

Strong typing.

Clean error handling.

Readable code.

Production quality only.

------------------------------------

## Git Rules

One feature branch.

One feature.

One Pull Request.

Small commits.

Never modify unrelated modules.

------------------------------------

## Performance

Avoid unnecessary renders.

Memoize expensive calculations.

Avoid duplicate API calls.

Avoid unnecessary state updates.

------------------------------------

## Security

Never expose secrets.

Never hardcode URLs.

Never hardcode credentials.

Use environment configuration.

------------------------------------

Always think before modifying existing code.

Prefer extending over replacing.
