import { NextRequest, NextResponse } from "next/server";
import { getDrizzleDb, portfolioProducts } from "@/lib/db/drizzle";
import { eq, asc } from "drizzle-orm";
import { withErrorHandler } from "@/lib/api-handler";
import { requireQuery, requireBody } from "@/lib/validations";
import {
  portfolioProductQuerySchema,
  createPortfolioProductSchema,
} from "@/lib/validations/schemas";
import { ConflictError } from "@/lib/errors";
import { serializePortfolioProduct } from "@/lib/portfolio-serialize";

/**
 * GET /api/portfolio-products
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  const db = getDrizzleDb();
  const { wildcard } = requireQuery(portfolioProductQuerySchema, request);

  let query = db.select().from(portfolioProducts);
  if (wildcard !== undefined) {
    query = query.where(eq(portfolioProducts.wildcard, wildcard)) as typeof query;
  }

  const products = query.orderBy(asc(portfolioProducts.displayOrder)).all();
  const parsed = products.map(serializePortfolioProduct);

  return NextResponse.json({
    products: parsed,
    total: parsed.length,
  });
});

/**
 * POST /api/portfolio-products
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const db = getDrizzleDb();
  const body = await requireBody(createPortfolioProductSchema, request);

  const existing = db
    .select()
    .from(portfolioProducts)
    .where(eq(portfolioProducts.id, body.id))
    .get();

  if (existing) {
    throw new ConflictError("Product with this ID already exists");
  }

  db.insert(portfolioProducts)
    .values({
      id: body.id,
      title: body.title,
      tagline: body.tagline,
      humaneDescription: body.humaneDescription,
      buyerPain: body.buyerPain,
      promise: body.promise,
      deliverables: JSON.stringify(body.deliverables),
      startingPrice: body.startingPrice,
      timeline: body.timeline,
      ctaLabel: body.ctaLabel,
      accent: body.accent,
      wildcard: body.wildcard,
      displayOrder: body.displayOrder,
      blueprintTitle: body.blueprintTitle ?? null,
      serviceTiers: JSON.stringify(body.serviceTiers ?? []),
      caseStudyCtaLabel: body.caseStudyCtaLabel ?? null,
    })
    .run();

  const product = db
    .select()
    .from(portfolioProducts)
    .where(eq(portfolioProducts.id, body.id))
    .get();

  try {
    const { registerObject } = await import("@/lib/object-registry");
    registerObject({
      type: "portfolio_product",
      sourceTable: "portfolio_products",
      sourceId: body.id,
      title: body.title,
      summary: body.tagline,
    });
  } catch {
    /* registry is non-critical */
  }

  const { markContextMetricsStale } = await import("@/lib/mark-context-metrics-stale");
  markContextMetricsStale();

  return NextResponse.json(serializePortfolioProduct(product!));
});
