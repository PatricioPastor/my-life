-- Long audio: a voice memory may now last up to 60 minutes. The two audio range checks from the voice memories
-- migration (2 minutes, 15 MB) are replaced by wider ones. Written by hand to be expand-only.
--
-- Production keeps running the previous code until the deploy. Everything it stores (at most 125000 ms and 15 MB)
-- is inside the new bounds, so each new check validates the existing rows, and the old code keeps working against
-- the new constraints. No column, table, index or type is added, renamed or dropped; the constraints keep their
-- names. Dropping and re-adding happen in one ALTER TABLE, so the table is never without them.
--
--  - Duration: 60 minutes (3600000 ms) plus 5 seconds of recorder drift = 3605000 ms. The server enforces the same
--    figure from what Cloudinary measured; this is the database backstop.
--  - Size: the server's cap is the Cloudinary plan maximum (100 MB by default) and can be raised with an env
--    variable for a larger plan; this backstop accepts anything up to 2000000000 bytes (the column is a 32-bit
--    INTEGER, so its own ceiling is 2147483647).
--
-- Row-level security and the grants are untouched.

ALTER TABLE "memories"
  DROP CONSTRAINT "memories_audio_duration_range",
  DROP CONSTRAINT "memories_audio_bytes_range",
  ADD CONSTRAINT "memories_audio_duration_range" CHECK ("audio_duration_ms" IS NULL OR "audio_duration_ms" BETWEEN 1 AND 3605000),
  ADD CONSTRAINT "memories_audio_bytes_range" CHECK ("audio_bytes" IS NULL OR "audio_bytes" BETWEEN 1 AND 2000000000);
