import type { PortfolioProduct, PortfolioProject } from "@/lib/db/schema";

export function serializePortfolioProduct(row: PortfolioProduct) {
  return {
    ...row,
    deliverables: JSON.parse(row.deliverables || "[]"),
    serviceTiers: JSON.parse(row.serviceTiers || "[]"),
    wildcard: !!row.wildcard,
  };
}

export function serializePortfolioProject(
  row: PortfolioProject,
  imageForClient?: string | null
) {
  return {
    ...row,
    image: imageForClient !== undefined ? imageForClient : row.image,
    featured: !!row.featured,
    visible: row.visible == null ? true : Boolean(row.visible),
    technologies: JSON.parse(row.technologies || "[]"),
    metrics: JSON.parse(row.metrics || "{}"),
    links: JSON.parse(row.links || "{}"),
    tags: JSON.parse(row.tags || "[]"),
    productIds: JSON.parse(row.productIds || "[]"),
  };
}
