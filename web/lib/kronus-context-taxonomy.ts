/** Canonical soul-context labels (aligned with SoulConfigState + Hourglass popover). */

export interface ContextSectionTaxonomyRow {
  section_key: string;
  label: string;
  category: "base" | "soul" | "integration";
  soul_config_key: string | null;
  source_tables: string[];
  sort_order: number;
}

export const KRONUS_CONTEXT_SECTION_SEED: ContextSectionTaxonomyRow[] = [
  {
    section_key: "base_prompt",
    label: "Base prompt",
    category: "base",
    soul_config_key: null,
    source_tables: [],
    sort_order: 0,
  },
  {
    section_key: "writings",
    label: "Writings",
    category: "soul",
    soul_config_key: "writings",
    source_tables: ["documents"],
    sort_order: 10,
  },
  {
    section_key: "portfolioProjects",
    label: "Services & Projects",
    category: "soul",
    soul_config_key: "portfolioProjects",
    source_tables: ["portfolio_projects", "portfolio_products"],
    sort_order: 20,
  },
  {
    section_key: "skills",
    label: "CV Skills",
    category: "soul",
    soul_config_key: "skills",
    source_tables: ["skills"],
    sort_order: 30,
  },
  {
    section_key: "workExperience",
    label: "Experience",
    category: "soul",
    soul_config_key: "workExperience",
    source_tables: ["work_experience"],
    sort_order: 40,
  },
  {
    section_key: "education",
    label: "Education",
    category: "soul",
    soul_config_key: "education",
    source_tables: ["education"],
    sort_order: 50,
  },
  {
    section_key: "journalEntries",
    label: "Journal",
    category: "soul",
    soul_config_key: "journalEntries",
    source_tables: ["journal_entries"],
    sort_order: 60,
  },
  {
    section_key: "chatIndex",
    label: "Chat memory",
    category: "soul",
    soul_config_key: "chatIndex",
    source_tables: ["chat_conversations"],
    sort_order: 70,
  },
  {
    section_key: "linearProjects",
    label: "Linear projects",
    category: "integration",
    soul_config_key: "linearProjects",
    source_tables: ["linear_projects"],
    sort_order: 80,
  },
  {
    section_key: "linearIssues",
    label: "Linear issues",
    category: "integration",
    soul_config_key: "linearIssues",
    source_tables: ["linear_issues"],
    sort_order: 90,
  },
  {
    section_key: "sliteNotes",
    label: "Slite",
    category: "integration",
    soul_config_key: "sliteNotes",
    source_tables: ["slite_notes"],
    sort_order: 100,
  },
  {
    section_key: "notionPages",
    label: "Notion",
    category: "integration",
    soul_config_key: "notionPages",
    source_tables: ["notion_pages"],
    sort_order: 110,
  },
  {
    section_key: "slackConversations",
    label: "Slack",
    category: "integration",
    soul_config_key: "slackConversations",
    source_tables: ["slack_conversations", "slack_messages"],
    sort_order: 120,
  },
];
