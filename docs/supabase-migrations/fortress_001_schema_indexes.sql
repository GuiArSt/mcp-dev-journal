-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_artifacts_integration ON ai_artifacts(integration_key);
CREATE INDEX IF NOT EXISTS idx_ai_events_session ON ai_log_events(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_slug ON ai_prompt_versions(prompt_slug);
CREATE INDEX IF NOT EXISTS idx_ai_proposals_integration ON ai_proposals(integration_key, status);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_integration ON ai_log_sessions(integration_key);
CREATE INDEX IF NOT EXISTS idx_ai_traces_conversation_id ON ai_traces(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_traces_endpoint ON ai_traces(endpoint);
CREATE INDEX IF NOT EXISTS idx_ai_traces_name ON ai_traces(name);
CREATE INDEX IF NOT EXISTS idx_ai_traces_started_at ON ai_traces(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_traces_trace_id ON ai_traces(trace_id);
CREATE INDEX IF NOT EXISTS idx_artemis_applications_follow_up
      ON artemis_applications(follow_up_at);
CREATE INDEX IF NOT EXISTS idx_artemis_applications_position
      ON artemis_applications(position_id);
CREATE INDEX IF NOT EXISTS idx_artemis_applications_status
      ON artemis_applications(status);
CREATE INDEX IF NOT EXISTS idx_artemis_artifacts_application
      ON artemis_application_artifacts(application_id);
CREATE INDEX IF NOT EXISTS idx_artemis_artifacts_document
      ON artemis_application_artifacts(document_id);
CREATE INDEX IF NOT EXISTS idx_artemis_artifacts_media
      ON artemis_application_artifacts(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_artemis_communications_application
      ON artemis_communications(application_id);
CREATE INDEX IF NOT EXISTS idx_artemis_communications_company
      ON artemis_communications(company_id);
CREATE INDEX IF NOT EXISTS idx_artemis_communications_occurred
      ON artemis_communications(occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artemis_companies_name_lower
      ON artemis_companies(lower(name));
CREATE INDEX IF NOT EXISTS idx_artemis_positions_company
      ON artemis_job_positions(company_id);
CREATE INDEX IF NOT EXISTS idx_artemis_positions_title
      ON artemis_job_positions(title);
CREATE INDEX IF NOT EXISTS idx_artemis_tasks_application
      ON artemis_tasks(application_id);
CREATE INDEX IF NOT EXISTS idx_artemis_tasks_due
      ON artemis_tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_artemis_tasks_status
      ON artemis_tasks(status);
CREATE INDEX IF NOT EXISTS idx_athena_items_next_review ON athena_learning_items(next_review);
CREATE INDEX IF NOT EXISTS idx_athena_items_type ON athena_learning_items(type);
CREATE INDEX IF NOT EXISTS idx_athena_items_user_repo ON athena_learning_items(user_id, repository);
CREATE INDEX IF NOT EXISTS idx_athena_sessions_repo ON athena_sessions(repository);
CREATE INDEX IF NOT EXISTS idx_athena_sessions_user ON athena_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_commit ON entry_attachments(commit_hash);
CREATE INDEX IF NOT EXISTS idx_branch ON journal_entries(repository, branch);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at ON chat_conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_client_errors_conversation_id
  ON client_errors(conversation_id);
CREATE INDEX IF NOT EXISTS idx_client_errors_received_at
  ON client_errors(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_session_id
  ON client_errors(session_id);
CREATE INDEX IF NOT EXISTS idx_client_memlog_conversation_id
      ON client_memlog(conversation_id);
CREATE INDEX IF NOT EXISTS idx_client_memlog_received_at
      ON client_memlog(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_memlog_session_id
      ON client_memlog(session_id);
CREATE INDEX IF NOT EXISTS idx_commit ON journal_entries(commit_hash);
CREATE INDEX IF NOT EXISTS idx_document_types_sortOrder ON document_types(sortOrder);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_language ON documents(language);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_education_dateStart ON education(dateStart);
CREATE INDEX IF NOT EXISTS idx_education_institution ON education(institution);
CREATE INDEX IF NOT EXISTS idx_linear_issues_assignee ON linear_issues(assignee_id);
CREATE INDEX IF NOT EXISTS idx_linear_issues_deleted ON linear_issues(is_deleted);
CREATE INDEX IF NOT EXISTS idx_linear_issues_project ON linear_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_linear_issues_state ON linear_issues(state_name);
CREATE INDEX IF NOT EXISTS idx_linear_issues_synced ON linear_issues(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_linear_projects_deleted ON linear_projects(is_deleted);
CREATE INDEX IF NOT EXISTS idx_linear_projects_state ON linear_projects(state);
CREATE INDEX IF NOT EXISTS idx_linear_projects_synced ON linear_projects(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_commit_hash ON media_assets(commit_hash);
CREATE INDEX IF NOT EXISTS idx_media_assets_created_at ON media_assets(created_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_destination ON media_assets(destination);
CREATE INDEX IF NOT EXISTS idx_media_digests_date ON media_digests(digest_date DESC);
CREATE INDEX IF NOT EXISTS idx_notion_pages_deleted ON notion_pages(is_deleted);
CREATE INDEX IF NOT EXISTS idx_notion_pages_parent ON notion_pages(parent_id);
CREATE INDEX IF NOT EXISTS idx_notion_pages_synced ON notion_pages(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_object_history_uuid ON tartarus_object_history(object_uuid);
CREATE INDEX IF NOT EXISTS idx_object_history_version ON tartarus_object_history(object_uuid, version);
CREATE INDEX IF NOT EXISTS idx_portfolio_products_display_order ON portfolio_products(display_order);
CREATE INDEX IF NOT EXISTS idx_portfolio_projects_visible ON portfolio_projects(visible);
CREATE INDEX IF NOT EXISTS idx_project_repo ON "repository_overviews"(repository);
CREATE INDEX IF NOT EXISTS idx_project_updates_project_id ON linear_project_updates(project_id);
CREATE INDEX IF NOT EXISTS idx_prompt_entry_links_entry ON prompt_entry_links(commit_hash);
CREATE INDEX IF NOT EXISTS idx_prompt_entry_links_prompt ON prompt_entry_links(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_trace_links_created ON prompt_trace_links(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_trace_links_prompt ON prompt_trace_links(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_trace_links_trace ON prompt_trace_links(trace_id);
CREATE INDEX IF NOT EXISTS idx_prompts_is_latest ON prompts(is_latest);
CREATE INDEX IF NOT EXISTS idx_prompts_parent_version ON prompts(parent_version_id);
CREATE INDEX IF NOT EXISTS idx_prompts_project_id ON prompts(project_id);
CREATE INDEX IF NOT EXISTS idx_prompts_role ON prompts(role);
CREATE INDEX IF NOT EXISTS idx_prompts_slug ON prompts(slug);
CREATE INDEX IF NOT EXISTS idx_prompts_status ON prompts(status);
CREATE INDEX IF NOT EXISTS idx_public_media_digest ON public_media(digest_id);
CREATE INDEX IF NOT EXISTS idx_public_media_importance ON public_media(importance DESC);
CREATE INDEX IF NOT EXISTS idx_public_media_topic ON public_media(topic);
CREATE INDEX IF NOT EXISTS idx_repository ON journal_entries(repository);
CREATE INDEX IF NOT EXISTS idx_skill_categories_sortOrder ON skill_categories(sortOrder);
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_magnitude ON skills(magnitude);
CREATE INDEX IF NOT EXISTS idx_slack_conversations_member ON slack_conversations(is_member);
CREATE INDEX IF NOT EXISTS idx_slack_conversations_vault_type ON slack_conversations(vault_type);
CREATE INDEX IF NOT EXISTS idx_slack_messages_conversation_ts ON slack_messages(conversation_id, ts);
CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_messages_unique_ts ON slack_messages(conversation_id, ts);
CREATE INDEX IF NOT EXISTS idx_slack_messages_user ON slack_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_slack_summary_runs_conversation ON slack_conversation_summary_runs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_slite_notes_deleted ON slite_notes(is_deleted);
CREATE INDEX IF NOT EXISTS idx_slite_notes_parent ON slite_notes(parent_note_id);
CREATE INDEX IF NOT EXISTS idx_slite_notes_synced ON slite_notes(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_tartarus_objects_source ON tartarus_objects(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_tartarus_objects_title ON tartarus_objects(title);
CREATE INDEX IF NOT EXISTS idx_tartarus_objects_type ON tartarus_objects(type);
CREATE INDEX IF NOT EXISTS idx_work_experience_company ON work_experience(company);
CREATE INDEX IF NOT EXISTS idx_work_experience_dateStart ON work_experience(dateStart);