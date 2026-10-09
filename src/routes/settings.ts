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
// The UI font scale vocabulary: 70%–150% of the root font size in 10% steps —
// the same levels the header font-size control offers.
const FONT_SCALES = [70, 80, 90, 100, 110, 120, 130, 140, 150] as const;

const preferencesBody = z
  .object({
    language: z.enum(LANGUAGES).optional(),
    theme: z.enum(THEMES).optional(),
    alphabetSize: z.enum(ALPHABET_SIZES).optional(),
    fontScale: z
      .number()
      .int()
      .min(FONT_SCALES[0])
      .max(FONT_SCALES[FONT_SCALES.length - 1])
      .refine((value) => value % 10 === 0, "font scale must be a multiple of 10")
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.language !== undefined ||
      value.theme !== undefined ||
      value.alphabetSize !== undefined ||
      value.fontScale !== undefined,
    "At least one preference must be supplied",
  );

const DEFAULTS = { language: "en", theme: "light", alphabetSize: "medium", fontScale: 100 } as const;

type StoredPreferences = {
  language: (typeof LANGUAGES)[number];
  theme: (typeof THEMES)[number];
  alphabetSize: (typeof ALPHABET_SIZES)[number];
  fontScale: (typeof FONT_SCALES)[number];
  updatedAt: string | null;
};

/** Defaults are returned when the user has never saved anything, so the client
 *  gets one shape whether or not a row exists. `updatedAt: null` is the signal
 *  that nothing was ever stored. */
async function readPreferences(userId: number): Promise<StoredPreferences> {
  const result = await query(
    `SELECT language, theme, alphabet_size, font_scale, updated_at FROM user_preferences WHERE user_id=$1`,
    [userId],
  );
  const row = result.rows[0];
  const language = String(row?.language ?? DEFAULTS.language);
  const theme = String(row?.theme ?? DEFAULTS.theme);
  const alphabetSize = String(row?.alphabet_size ?? DEFAULTS.alphabetSize);
  // Snap to the 10% vocabulary so a hand-edited value can never escape it.
  const rawScale = Number(row?.font_scale ?? DEFAULTS.fontScale);
  const fontScale = Number.isFinite(rawScale)
    ? (Math.min(150, Math.max(70, Math.round(rawScale / 10) * 10)) as StoredPreferences["fontScale"])
    : DEFAULTS.fontScale;
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
    fontScale,
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
      throw new AppError(
        400,
        "Language must be 'en'/'te', theme 'light'/'dark', alphabet size 'small'/'medium'/'large', font scale 70–150 in steps of 10",
      );
    }
    const language = parsed.data.language ?? null;
    const theme = parsed.data.theme ?? null;
    const alphabetSize = parsed.data.alphabetSize ?? null;
    const fontScale = parsed.data.fontScale ?? null;
    await query(
      `INSERT INTO user_preferences (user_id, language, theme, alphabet_size, font_scale)
       VALUES ($1, COALESCE($2,'en'), COALESCE($3,'light'), COALESCE($4,'medium'), COALESCE($5,100))
       ON CONFLICT (user_id) DO UPDATE
          SET language      = COALESCE($2, user_preferences.language),
              theme         = COALESCE($3, user_preferences.theme),
              alphabet_size = COALESCE($4, user_preferences.alphabet_size),
              font_scale    = COALESCE($5, user_preferences.font_scale),
              updated_at    = NOW()`,
      [user.id, language, theme, alphabetSize, fontScale],
    );
    res.json(await readPreferences(user.id));
  }),
);
