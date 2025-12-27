-- Migration 003: Portfolio Projects Table
-- Creates table for portfolio showcase projects (distinct from project_summaries)
-- Created: 2025-12-27

CREATE TABLE IF NOT EXISTS portfolio_projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    company TEXT,
    date_completed TEXT,
    status TEXT NOT NULL DEFAULT 'shipped' CHECK (status IN ('shipped', 'wip', 'archived')),
    featured INTEGER DEFAULT 0,
    image TEXT,
    excerpt TEXT,
    description TEXT,
    role TEXT,
    technologies TEXT DEFAULT '[]',
    metrics TEXT DEFAULT '{}',
    links TEXT DEFAULT '{}',
    tags TEXT DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indices for common queries
CREATE INDEX IF NOT EXISTS idx_portfolio_projects_category ON portfolio_projects(category);
CREATE INDEX IF NOT EXISTS idx_portfolio_projects_status ON portfolio_projects(status);
CREATE INDEX IF NOT EXISTS idx_portfolio_projects_featured ON portfolio_projects(featured);
CREATE INDEX IF NOT EXISTS idx_portfolio_projects_sort ON portfolio_projects(sort_order);
