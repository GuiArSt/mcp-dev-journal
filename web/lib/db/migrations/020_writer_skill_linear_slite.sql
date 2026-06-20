-- Writer skill: creative work + team knowledge (Slite) + project context (Linear).
-- Developer stays lean; Writer keeps Linear/Slite as bundled integrations.
UPDATE documents
SET
  content = 'Focus on creative expression, written works, and content creation. You are in writer mode — assist with writing, editing, and curating documents in the repository. You have access to media and image generation tools for visual accompaniment. Draw on the creator''s existing writings for voice and style continuity. Use Slite for team knowledge and Linear when writing ties to projects, issues, or delivery context.',
  metadata = json_set(
    metadata,
    '$.skillConfig.soul',
    json('{"writings":true,"sliteNotes":true,"linearProjects":true,"linearIssues":true}'),
    '$.skillConfig.tools',
    json('{"journal":true,"repository":true,"media":true,"imageGeneration":true,"webSearch":true,"slite":true,"linear":true}')
  ),
  updated_at = datetime('now')
WHERE slug = 'skill-writer';
