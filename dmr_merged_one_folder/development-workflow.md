# Development Workflow

For every feature:

1. Analyze
2. Plan
3. Backend (only if required)
4. Backend QA
5. Merge Backend
6. Frontend Integration
7. Frontend QA
8. Merge Frontend
9. Regression Test
10. Move to next feature

Rules:

- One feature branch.
- One feature.
- One Pull Request.
- One module at a time.
- No redesign.
- PostgreSQL is the source of truth.
- No localStorage for business data.
- Existing UI must be preserved.
- Test before merge.