import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDatabase();

    const attachment = db.prepare(`
      SELECT data, mime_type, filename, file_size
      FROM entry_attachments
      WHERE id = ?
    `).get(id) as {
      data: Buffer;
      mime_type: string;
      filename: string;
      file_size: number;
    } | undefined;

    if (!attachment) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const data = new Uint8Array(attachment.data);

    // Return raw binary data with appropriate content type
    return new NextResponse(data, {
      headers: {
        "Content-Type": attachment.mime_type,
        "Content-Length": attachment.file_size.toString(),
        "Content-Disposition": `inline; filename="${attachment.filename}"`,
        "Cache-Control": "public, max-age=31536000",
      },
    });
  } catch (error) {
    console.error("Get raw attachment error:", error);
    return NextResponse.json(
      { error: "Failed to get attachment" },
      { status: 500 }
    );
  }
}
