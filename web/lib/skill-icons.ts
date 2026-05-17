/**
 * Utility to fetch icons for recognized skills/technologies
 * Uses Simple Icons CDN and common tech icon mappings
 */

// Common tech name to Simple Icons slug mapping
const TECH_ICON_MAP: Record<string, string> = {
  // Web Frameworks
  react: "react",
  reactjs: "react",
  "next.js": "nextdotjs",
  nextjs: "nextdotjs",
  vue: "vuedotjs",
  "vue.js": "vuedotjs",
  angular: "angular",
  svelte: "svelte",
  hono: "hono",
  express: "express",
  fastify: "fastify",

  // Languages
  typescript: "typescript",
  javascript: "javascript",
  python: "python",
  rust: "rust",
  go: "go",
  golang: "go",
  java: "openjdk",
  "c#": "csharp",
  csharp: "csharp",
  "c++": "cplusplus",
  ruby: "ruby",
  php: "php",
  swift: "swift",
  kotlin: "kotlin",
  html: "html5",
  html5: "html5",
  "html & css": "html5",
  css: "css3",
  css3: "css3",

  // Runtime & Build
  "node.js": "nodedotjs",
  nodejs: "nodedotjs",
  deno: "deno",
  bun: "bun",

  // Infrastructure
  docker: "docker",
  kubernetes: "kubernetes",
  k8s: "kubernetes",
  aws: "amazonaws",
  gcp: "googlecloud",
  azure: "microsoftazure",
  terraform: "terraform",
  ansible: "ansible",

  // Databases
  postgresql: "postgresql",
  postgres: "postgresql",
  mongodb: "mongodb",
  redis: "redis",
  mysql: "mysql",
  sqlite: "sqlite",
  supabase: "supabase",
  firebase: "firebase",

  // API & Data
  graphql: "graphql",
  rest: "postman",
  trpc: "trpc",

  // Styling
  tailwindcss: "tailwindcss",
  tailwind: "tailwindcss",
  sass: "sass",
  "styled-components": "styledcomponents",

  // Version Control
  git: "git",
  github: "github",
  gitlab: "gitlab",

  // Design
  figma: "figma",
  adobe: "adobe",
  photoshop: "adobephotoshop",
  illustrator: "adobeillustrator",
  premiere: "adobepremierepro",
  "after effects": "adobeaftereffects",
  sketch: "sketch",
  canva: "canva",

  // Productivity
  linear: "linear",
  slack: "slack",
  notion: "notion",
  jira: "jira",
  confluence: "confluence",

  // Hosting & Deploy
  vercel: "vercel",
  netlify: "netlify",
  heroku: "heroku",
  digitalocean: "digitalocean",
  cloudflare: "cloudflare",

  // AI & ML
  openai: "openai",
  anthropic: "anthropic",
  claude: "anthropic",
  gpt: "openai",
  langchain: "langchain",
  langfuse: "langfuse",
  huggingface: "huggingface",
  tensorflow: "tensorflow",
  pytorch: "pytorch",

  // Testing
  jest: "jest",
  vitest: "vitest",
  playwright: "playwright",
  cypress: "cypress",

  // Other
  mcp: "openai", // Model Context Protocol
  drizzle: "drizzle",
  prisma: "prisma",
  stripe: "stripe",
  auth0: "auth0",
};

/**
 * Get icon URL for a skill/technology name
 * @param skillName - Name of the skill/technology
 * @returns Icon URL or null if not found
 */
export function getSkillIconUrl(skillName: string): string | null {
  const normalized = skillName.toLowerCase().trim();

  // Check direct mapping
  const slug = TECH_ICON_MAP[normalized];
  if (slug) {
    return `https://cdn.simpleicons.org/${slug}/8b4513`;
  }

  // Try to find partial match
  for (const [key, value] of Object.entries(TECH_ICON_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return `https://cdn.simpleicons.org/${value}/8b4513`;
    }
  }

  return null;
}

/**
 * Get icon URL with custom color
 */
export function getSkillIconUrlWithColor(
  skillName: string,
  color: string = "8b4513"
): string | null {
  const normalized = skillName.toLowerCase().trim();
  const slug = TECH_ICON_MAP[normalized];
  if (!slug) return null;
  return `https://cdn.simpleicons.org/${slug}/${color.replace("#", "")}`;
}
