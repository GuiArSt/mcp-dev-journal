-- Fix muse_config cross-wiring from migration 025:
-- provider=google + driver=gemini-3.5-flash + painter=gpt-image-2 sent Gemini model
-- ids through the wrong SDK path. Default muse brain to OpenAI + GPT Image 2;
-- keep observe on gemini-2.5-flash (broadly available).

UPDATE muse_config
SET
  provider = 'openai',
  driver_model = 'gpt-5.5',
  painter_model = 'gpt-image-2',
  observe_model = 'gemini-2.5-flash',
  updated_at = datetime('now')
WHERE id = 1
  AND provider = 'google'
  AND driver_model = 'gemini-3.5-flash'
  AND painter_model = 'gpt-image-2';
