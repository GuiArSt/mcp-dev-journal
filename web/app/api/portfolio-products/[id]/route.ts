import { NextRequest, NextResponse } from "next/server";
import { getDrizzleDb, portfolioProducts } from "@/lib/db/drizzle";
import { eq } from "drizzle-orm";
import { withErrorHandler } from "@/lib/api-handler";
import { requireParams, requireBody } from "@/lib/validations";
import { stringIdParamSchema, updatePortfolioProductSchema } from "@/lib/validations/schemas";
import { NotFoundError } from "@/lib/errors";
import { serializePortfolioProduct } from "@/lib/portfolio-serialize";

/**
 * GET /api/portfolio-products/[id]
 */
export const GET = withErrorHandler(
  async (_request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const { id } = requireParams(stringIdParamSchema, resolvedParams);
    const db = getDrizzleDb();

    const product = db.select().from(portfolioProducts).where(eq(portfolioProducts.id, id)).get();
    if (!product) {
      throw new NotFoundError("Portfolio product", id);
    }

    return NextResponse.json(serializePortfolioProduct(product));
  }
);

/**
 * PUT /api/portfolio-products/[id]
 */
export const PUT = withErrorHandler(
  async (request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const { id } = requireParams(stringIdParamSchema, resolvedParams);
    const db = getDrizzleDb();
    const body = await requireBody(updatePortfolioProductSchema, request);

    const existing = db.select().from(portfolioProducts).where(eq(portfolioProducts.id, id)).get();
    if (!existing) {
      throw new NotFoundError("Portfolio product", id);
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.tagline !== undefined) updateData.tagline = body.tagline;
    if (body.humaneDescription !== undefined) updateData.humaneDescription = body.humaneDescription;
    if (body.buyerPain !== undefined) updateData.buyerPain = body.buyerPain;
    if (body.promise !== undefined) updateData.promise = body.promise;
    if (body.startingPrice !== undefined) updateData.startingPrice = body.startingPrice;
    if (body.timeline !== undefined) updateData.timeline = body.timeline;
    if (body.ctaLabel !== undefined) updateData.ctaLabel = body.ctaLabel;
    if (body.accent !== undefined) updateData.accent = body.accent;
    if (body.wildcard !== undefined) updateData.wildcard = body.wildcard;
    if (body.displayOrder !== undefined) updateData.displayOrder = body.displayOrder;
    if (body.deliverables !== undefined) {
      updateData.deliverables = JSON.stringify(body.deliverables);
    }
    if (body.blueprintTitle !== undefined) updateData.blueprintTitle = body.blueprintTitle;
    if (body.caseStudyCtaLabel !== undefined) updateData.caseStudyCtaLabel = body.caseStudyCtaLabel;
    if (body.serviceTiers !== undefined) {
      updateData.serviceTiers = JSON.stringify(body.serviceTiers);
    }

    db.update(portfolioProducts).set(updateData).where(eq(portfolioProducts.id, id)).run();

    const product = db.select().from(portfolioProducts).where(eq(portfolioProducts.id, id)).get();

    try {
      const { registerObject } = await import("@/lib/object-registry");
      registerObject({
        type: "portfolio_product",
        sourceTable: "portfolio_products",
        sourceId: id,
        title: product?.title || existing.title,
        summary: product?.tagline || existing.tagline,
      });
    } catch {
      /* registry is non-critical */
    }

    return NextResponse.json(serializePortfolioProduct(product!));
  }
);
