import type { PortfolioProduct, PortfolioProject } from "@/lib/db/schema";

function parseJsonArray(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function formatProduct(product: PortfolioProduct): string {
  const deliverables = parseJsonArray(product.deliverables).join(", ");
  const body = product.summary?.trim() || product.humaneDescription || "";

  return `### ${product.title}
**Tagline:** ${product.tagline}
**Promise:** ${product.promise}
**Buyer pain:** ${product.buyerPain}
${deliverables ? `**Deliverables:** ${deliverables}` : ""}
**Timeline:** ${product.timeline} | **From:** ${product.startingPrice}

${body}`;
}

function formatProject(
  project: PortfolioProject,
  productTitleById: Map<string, string>,
): string {
  const techs = parseJsonArray(project.technologies).join(", ");
  const metrics = (() => {
    try {
      return JSON.parse(project.metrics || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  const metricsStr = Object.entries(metrics)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");

  const productIds = parseJsonArray(project.productIds);
  const linkedServices =
    productIds.length > 0
      ? productIds
          .map((id) => productTitleById.get(id) ?? id)
          .join(", ")
      : "";

  return `### ${project.title}
**Category:** ${project.category} | **Company:** ${project.company || "Personal"} | **Status:** ${project.status}${project.featured ? " ⭐" : ""}
**Role:** ${project.role || "N/A"}
${linkedServices ? `**Linked services:** ${linkedServices}` : ""}
**Technologies:** ${techs || "N/A"}
${metricsStr ? `**Metrics:** ${metricsStr}` : ""}

${project.description || project.excerpt || ""}`;
}

/**
 * Unified portfolio hub block for Kronus soul + token metrics.
 * Mirrors the public site: services (products) + proof (projects).
 */
export function buildPortfolioSoulSection(
  products: PortfolioProduct[],
  projects: PortfolioProject[],
): string {
  const blocks: string[] = [];

  if (products.length > 0) {
    const productSection = products.map(formatProduct).join("\n\n---\n\n");
    blocks.push(`## Services & Offerings (${products.length})

Commercial offerings — what clients can commission. Projects below are proof linked to these services.

${productSection}`);
  }

  if (projects.length > 0) {
    const productTitleById = new Map(products.map((p) => [p.id, p.title]));
    const projectSection = projects
      .map((p) => formatProject(p, productTitleById))
      .join("\n\n---\n\n");

    blocks.push(`## Portfolio Projects (${projects.length})

Shipped work and case studies. Use \`repository_get_portfolio_project\` or \`repository_get_portfolio_product\` for full detail.

${projectSection}`);
  }

  return blocks.join("\n\n");
}
