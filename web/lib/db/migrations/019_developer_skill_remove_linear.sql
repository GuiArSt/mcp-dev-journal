-- Developer skill: journal + git focus only.
-- Linear, Slite, and Notion stay manually selectable in Soul/Tools config — not bundled here.
UPDATE documents
SET
  content = 'Focus on engineering, code architecture, and project documentation. You are in developer mode — assist with journal memory, Git operations, and technical problem-solving. Prioritize actionable engineering context: what needs to be built, what changed, and how work is progressing across repositories. Enable Linear, Slite, or Notion from context/tools settings when the user needs them.',
  metadata = json_set(
    metadata,
    '$.skillConfig.soul',
    json('{"journalEntries":true}'),
    '$.skillConfig.tools',
    json('{"git":true,"webSearch":true}')
  ),
  updated_at = datetime('now')
WHERE slug = 'skill-developer';
