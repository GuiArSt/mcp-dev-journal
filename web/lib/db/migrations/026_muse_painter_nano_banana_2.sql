-- Retire Nano Banana 1 (nano-banana / gemini-2.5-flash-image) → Nano Banana 2.
-- Default painter remains GPT Image 2 for new muse_config rows (see prompt-store).

UPDATE muse_config
SET painter_model = 'nano-banana-2', updated_at = datetime('now')
WHERE painter_model IN ('nano-banana', 'gemini-2.5-flash-image');

UPDATE muse_config
SET observe_model = 'gemini-3.5-flash', updated_at = datetime('now')
WHERE observe_model = 'gemini-2.5-flash';
