import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
  STORAGE_BUCKET,
} from "@/lib/supabase/server";
import { withErrorHandler } from "@/lib/api-handler";
import { requireQuery } from "@/lib/validations";
import { ValidationError, ExternalServiceError } from "@/lib/errors";
import { z } from "zod";

const storageQuerySchema = z.object({
  path: z.string().default("uploads"),
});

const deleteQuerySchema = z.object({
  path: z.string().min(1, "Path is required"),
});

/**
 * GET /api/storage
 *
 * List images or check status.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({
      configured: false,
      message:
        "Supabase storage not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      images: [],
    });
  }

  const client = getSupabaseAdmin();
  if (!client) {
    throw new ExternalServiceError("Supabase client not available");
  }

  const { path } = requireQuery(storageQuerySchema, request);

  const { data, error } = await client.storage.from(STORAGE_BUCKET).list(path);

  if (error) {
    console.error("List error:", error);
    throw new ExternalServiceError("Supabase storage", new Error(error.message));
  }

  return NextResponse.json({
    configured: true,
    images: data || [],
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  });
});

/**
 * POST /api/storage
 *
 * Upload image.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!isSupabaseAdminConfigured()) {
    throw new ValidationError("Supabase storage not configured");
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const path = formData.get("path") as string;
  const commitHash = formData.get("commitHash") as string;

  if (!file) {
    throw new ValidationError("No file provided");
  }

  const client = getSupabaseAdmin();
  if (!client) {
    throw new ExternalServiceError("Supabase client not available");
  }

  // Generate path if not provided
  const uploadPath = path || `${commitHash || "general"}/${Date.now()}-${file.name}`;

  // Convert File to ArrayBuffer for upload
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { data, error } = await client.storage.from(STORAGE_BUCKET).upload(uploadPath, buffer, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });

  if (error) {
    console.error("Upload error:", error);
    throw new ExternalServiceError("Supabase storage upload", new Error(error.message));
  }

  const { data: urlData } = client.storage.from(STORAGE_BUCKET).getPublicUrl(data.path);

  return NextResponse.json({
    success: true,
    url: urlData.publicUrl,
    path: data.path,
  });
});

/**
 * DELETE /api/storage
 *
 * Delete image.
 */
export const DELETE = withErrorHandler(async (request: NextRequest) => {
  if (!isSupabaseAdminConfigured()) {
    throw new ValidationError("Supabase storage not configured");
  }

  const { path } = requireQuery(deleteQuerySchema, request);

  const client = getSupabaseAdmin();
  if (!client) {
    throw new ExternalServiceError("Supabase client not available");
  }

  const { error } = await client.storage.from(STORAGE_BUCKET).remove([path]);

  if (error) {
    console.error("Delete error:", error);
    throw new ExternalServiceError("Supabase storage delete", new Error(error.message));
  }

  return NextResponse.json({
    success: true,
    message: "Image deleted",
  });
});
