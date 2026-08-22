// src/context/NotificationContext.tsx
// Canonical notification context lives in src/providers/NotificationProvider.
// This file is kept as a re-export so older import paths keep working and the
// app always shares a single context instance.

export { NotificationProvider, useNotification } from "../providers/NotificationProvider";
