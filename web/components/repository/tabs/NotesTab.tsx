"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StickyNote } from "lucide-react";
import { stripMarkdown } from "@/components/repository/shared";
import type { Document } from "@/lib/types/repository";

interface NotesTabProps {
  notes: Document[];
  loading: boolean;
}

export function NotesTab({ notes, loading }: NotesTabProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="overflow-hidden border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
            <div className="h-0.5 bg-[var(--tartarus-teal)]" />
            <CardHeader>
              <Skeleton className="h-5 w-3/4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--tartarus-teal-soft)]">
            <StickyNote className="h-8 w-8 text-[var(--tartarus-teal)]" />
          </div>
          <p className="text-[var(--tartarus-ivory-muted)]">No notes yet</p>
          <p className="text-sm text-[var(--tartarus-ivory-faded)]">
            Notes are quick reference material, snippets, and personal observations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {notes.map((doc) => (
        <Link key={doc.slug} href={`/library/${doc.slug}`} className="stagger-item">
          <Card className="group relative flex h-full cursor-pointer flex-col overflow-hidden border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-[var(--tartarus-teal-dim)] hover:shadow-[0_0_20px_rgba(0,206,209,0.1)]">
            {/* Decorative accent bar */}
            <div className="h-0.5 bg-[var(--tartarus-teal)]" />

            <CardHeader className="pb-2">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--tartarus-teal-soft)]">
                  <StickyNote className="h-5 w-5 text-[var(--tartarus-teal)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle className="line-clamp-2 text-base font-semibold text-[var(--tartarus-ivory)]">
                    {doc.title}
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col pt-0">
              <p className="text-[var(--tartarus-ivory-muted)] line-clamp-3 flex-1 text-sm">
                {doc.summary ||
                  stripMarkdown(doc.content || "").substring(0, 150) + "..."}
              </p>

              {doc.metadata?.tags && doc.metadata.tags.length > 0 && (
                <div className="mt-3 border-t border-[var(--tartarus-border)] pt-2">
                  <div className="flex flex-wrap gap-1">
                    {doc.metadata.tags.slice(0, 3).map((tag: string) => (
                      <span
                        key={tag}
                        className="rounded border border-[var(--tartarus-teal-dim)] bg-[var(--tartarus-teal-soft)] px-1.5 py-0.5 text-[9px] text-[var(--tartarus-teal)]"
                      >
                        {tag}
                      </span>
                    ))}
                    {doc.metadata.tags.length > 3 && (
                      <span className="text-[var(--tartarus-ivory-faded)] px-1.5 py-0.5 text-[9px]">
                        +{doc.metadata.tags.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
