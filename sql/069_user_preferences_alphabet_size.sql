-- 069: Alphabet size (font scale) preference.
--
-- Complements language/theme in user_preferences: one of small/medium/large,
-- applied as the root font-size scale on the client so every rem-based size
-- follows the reader's choice.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS alphabet_size VARCHAR(8) NOT NULL DEFAULT 'medium'
    CHECK (alphabet_size IN ('small','medium','large'));
