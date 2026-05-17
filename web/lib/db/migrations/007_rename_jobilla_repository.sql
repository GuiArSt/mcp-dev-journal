-- Migration: Rename repository "Jobilla" to "jobilla" (lowercase)
-- This standardizes the repository naming convention

-- Update journal_entries
UPDATE journal_entries SET repository = 'jobilla' WHERE repository = 'Jobilla';

-- Update repository_overviews (legacy installs may still have project_summaries)
UPDATE repository_overviews SET repository = 'jobilla' WHERE repository = 'Jobilla';
