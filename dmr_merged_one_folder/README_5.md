# Shared Trip Entry Core

This folder is the frontend authority for Trip Entry concepts consumed by both:

- Desktop ERP: `modules/operations/vehicle-trips`
- Supervisor Mobile: `modules/supervisor-mobile`

It owns:

- `types.ts` — Trip, delivery, box and status types
- `definitions.ts` — Steps 1–5 and field metadata
- `defaults.ts` — initial Trip state
- `validation.ts` — shared step and final validations
- `calculations.ts` — pickup, delivery, mortality, distance and mileage calculations
- `workflow.ts` — step order, labels, status and next-step rules

Desktop and mobile page shells retain their own navigation, spacing, authentication, offline and synchronization behavior. The existing responsive Step components are shared presentation primitives, so a form control is maintained once while each shell remains platform-appropriate.
