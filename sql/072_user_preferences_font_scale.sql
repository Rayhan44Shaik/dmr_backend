-- 072: Precise font scale preference (percent of the root font size).
--
-- Replaces the coarse alphabet_size (small/medium/large) vocabulary with the
-- same 70%–150% scale the header's font-size control uses, so Settings and the
-- header can never disagree about the reader's choice. Existing alphabet
-- choices are carried over to the nearest supported step (small 87.5% → 90%,
-- medium → 100%, large 112.5% → 110%). alphabet_size stays in place so older
-- clients keep working.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS font_scale SMALLINT NOT NULL DEFAULT 100
    CHECK (font_scale BETWEEN 70 AND 150);

UPDATE user_preferences
   SET font_scale = CASE alphabet_size
                      WHEN 'small' THEN 90
                      WHEN 'large' THEN 110
                      ELSE 100
                    END
 WHERE font_scale = 100;
