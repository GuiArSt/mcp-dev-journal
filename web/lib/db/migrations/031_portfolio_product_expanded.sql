-- Expanded product catalog fields: blueprint header, service tiers, case-study CTA.
ALTER TABLE portfolio_products ADD COLUMN blueprint_title TEXT;
ALTER TABLE portfolio_products ADD COLUMN service_tiers TEXT DEFAULT '[]';
ALTER TABLE portfolio_products ADD COLUMN case_study_cta_label TEXT;
