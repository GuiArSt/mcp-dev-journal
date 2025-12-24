import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";

export async function GET() {
  try {
    const db = getDatabase();
    const repositories = db
      .prepare("SELECT DISTINCT repository FROM journal_entries ORDER BY repository ASC")
      .all() as Array<{ repository: string }>;

    return NextResponse.json(repositories.map((r) => r.repository));
  } catch (error) {
    console.error("Error fetching repositories:", error);
    return NextResponse.json({ error: "Failed to fetch repositories" }, { status: 500 });
  }
}










