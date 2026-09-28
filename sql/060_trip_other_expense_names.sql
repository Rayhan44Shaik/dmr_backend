-- User-defined descriptions for Step 5 "Other" expense rows.
-- others1_amt is the fixed RTO row; rows 2-5 are named by the user.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS others2_name VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS others3_name VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS others4_name VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS others5_name VARCHAR(120) NOT NULL DEFAULT '';
