import { Router } from "express";
import { z } from "zod";
import { query } from "../config/db.js";
import { authUser } from "../middleware/auth.js";
import { AppError, asyncHandler } from "../middleware/errorHandler.js";

/**
 * Per-user settings (self-scoped).
 *
 * Everything here operates on the CALLER's own row only — there is no id in any
 * request, so a preference endpoint can never be turned into an account-enumeration
 * or cross-account write surface. The employee access directory stays under
 * /access-management, where it is role-gated.
 */
export const settingsRouter = Router();

const LANGUAGES = ["en", "te"] as const;
const THEMES = ["light", "dark"] as const;
const ALPHABET_SIZES = ["small", "medium", "large"] as const;

const preferencesBody = z
  .object({
    language: z.enum(LANGUAGES).optional(),
    theme: z.enum(THEMES).optional(),
    alphabetSize: z.enum(ALPHABET_SIZES).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.language !== undefined ||
      value.theme !== undefined ||
      value.alphabetSize !== undefined,
    "At least one preference must be supplied",
  );

const DEFAULTS = { language: "en", theme: "light", alphabetSize: "medium" } as const;

type StoredPreferences = {
  language: (typeof LANGUAGES)[number];
  theme: (typeof THEMES)[number];
  alphabetSize: (typeof ALPHABET_SIZES)[number];
  updatedAt: string | null;
};

/** Defaults are returned when the user has never saved anything, so the client
 *  gets one shape whether or not a row exists. `updatedAt: null` is the signal
 *  that nothing was ever stored. */
async function readPreferences(userId: number): Promise<StoredPreferences> {
  const result = await query(
    `SELECT language, theme, alphabet_size, updated_at FROM user_preferences WHERE user_id=$1`,
    [userId],
  );
  const row = result.rows[0];
  const language = String(row?.language ?? DEFAULTS.language);
  const theme = String(row?.theme ?? DEFAULTS.theme);
  const alphabetSize = String(row?.alphabet_size ?? DEFAULTS.alphabetSize);
  return {
    language: (LANGUAGES as readonly string[]).includes(language)
      ? (language as StoredPreferences["language"])
      : DEFAULTS.language,
    theme: (THEMES as readonly string[]).includes(theme)
      ? (theme as StoredPreferences["theme"])
      : DEFAULTS.theme,
    alphabetSize: (ALPHABET_SIZES as readonly string[]).includes(alphabetSize)
      ? (alphabetSize as StoredPreferences["alphabetSize"])
      : DEFAULTS.alphabetSize,
    updatedAt: row?.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
  };
}

settingsRouter.get(
  "/preferences",
  asyncHandler(async (_req, res) => {
    const user = authUser(res);
    res.json(await readPreferences(user.id));
  }),
);

settingsRouter.patch(
  "/preferences",
  asyncHandler(async (req, res) => {
    const user = authUser(res);
    const parsed = preferencesBody.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "Language must be 'en'/'te', theme 'light'/'dark', alphabet size 'small'/'medium'/'large'");
    }
    const language = parsed.data.language ?? null;
    const theme = parsed.data.theme ?? null;
    const alphabetSize = parsed.data.alphabetSize ?? null;
    await query(
      `INSERT INTO user_preferences (user_id, language, theme, alphabet_size)
       VALUES ($1, COALESCE($2,'en'), COALESCE($3,'light'), COALESCE($4,'medium'))
       ON CONFLICT (user_id) DO UPDATE
          SET language      = COALESCE($2, user_preferences.language),
              theme         = COALESCE($3, user_preferences.theme),
              alphabet_size = COALESCE($4, user_preferences.alphabet_size),
              updated_at    = NOW()`,
      [user.id, language, theme, alphabetSize],
    );
    res.json(await readPreferences(user.id));
  }),
);
