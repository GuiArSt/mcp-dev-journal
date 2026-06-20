-- Linear and Slite are manual toggles only — not bundled in any Kronus skill preset.

UPDATE documents
SET
  content = 'Focus on creative expression, written works, and content creation. You are in writer mode — assist with writing, editing, and curating documents in the repository. You have access to media and image generation tools for visual accompaniment. Draw on the creator''s existing writings for voice and style continuity.',
  metadata = json_set(
    metadata,
    '$.skillConfig.soul',
    json('{"writings":true}'),
    '$.skillConfig.tools',
    json('{"journal":true,"repository":true,"media":true,"imageGeneration":true,"webSearch":true}')
  ),
  updated_at = datetime('now')
WHERE slug = 'skill-writer';

UPDATE documents
SET
  content = 'Focus on career presentation, job applications, and professional branding. You are in job hunter mode — you have full access to the creator''s CV data: skills, work experience, education, portfolio projects, and journal entries. Help craft cover letters, prepare for interviews, analyze job descriptions, and present the creator''s qualifications compellingly.',
  metadata = json_set(
    metadata,
    '$.skillConfig.soul',
    json('{"skills":true,"workExperience":true,"education":true,"portfolioProjects":true,"journalEntries":true}'),
    '$.skillConfig.tools',
    json('{"journal":true,"repository":true,"media":true,"webSearch":true}')
  ),
  updated_at = datetime('now')
WHERE slug = 'skill-job-hunter';

UPDATE documents
SET
  content = 'Full power mode. All core Tartarus context sections and tools are loaded: writings, portfolio, skills, work experience, education, journal entries, git, media, image generation, web search, Google Workspace, memory, and AI integrations. Enable Linear, Slite, or Notion from context/tools settings when needed.',
  metadata = json_set(
    metadata,
    '$.skillConfig.soul',
    json('{"writings":true,"portfolioProjects":true,"skills":true,"workExperience":true,"education":true,"journalEntries":true,"chatIndex":true}'),
    '$.skillConfig.tools',
    json('{"journal":true,"repository":true,"cursorDelegate":true,"git":true,"media":true,"imageGeneration":true,"webSearch":true,"google":true,"memory":true,"aiIntegrations":true}')
  ),
  updated_at = datetime('now')
WHERE slug = 'skill-almighty';
