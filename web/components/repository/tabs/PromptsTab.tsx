"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Code, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { formatMonthYear } from "@/lib/utils";
import type { Document } from "@/lib/types/repository";

interface PromptsTabProps {
  prompts: Document[];
  loading: boolean;
  hasActiveFilters: boolean;
  clearFilters: () => void;
  expandedSummaries: Set<number>;
  toggleSummary: (docId: number, e: React.MouseEvent) => void;
  editDocumentWithKronus: (doc: Document, e: React.MouseEvent) => void;
  getDocTypeColors: (typeName: string) => { color: string; bgColor: string; barColor: string };
}

export function PromptsTab({
  prompts,
  loading,
  hasActiveFilters,
  clearFilters,
  expandedSummaries,
  toggleSummary,
  editDocumentWithKronus,
  getDocTypeColors,
}: PromptsTabProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="overflow-hidden border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
            <div className="h-0.5 bg-gradient-to-r from-[var(--tartarus-teal)] to-[var(--tartarus-purple)]" />
            <CardHeader>
              <Skeleton className="h-5 w-2/3" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (prompts.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--tartarus-teal-soft)]">
            <Code className="h-8 w-8 text-[var(--tartarus-teal)]" />
          </div>
          <p className="text-muted-foreground">No prompts found.</p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid auto-rows-fr gap-4 md:grid-cols-2 lg:grid-cols-3">
      {prompts.map((doc) => (
        <Link key={doc.id} href={`/library/${doc.slug}`} className="stagger-item">
          <Card className="group relative flex h-full cursor-pointer flex-col overflow-hidden border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-[var(--tartarus-teal-dim)] hover:shadow-[0_0_20px_rgba(0,206,209,0.1)]">
            {/* Edit with Kronus button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 z-10 h-8 w-8 text-[var(--tartarus-gold)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--tartarus-gold-soft)] hover:text-[var(--tartarus-gold-dim)]"
              onClick={(e) => editDocumentWithKronus(doc, e)}
              title="Edit with Kronus"
            >
              <img
                src="/chronus-logo.png"
                alt="Kronus"
                className="h-4 w-4 rounded-full object-cover"
              />
            </Button>

            {/* Decorative gradient bar */}
            <div className="h-0.5 bg-gradient-to-r from-[var(--tartarus-teal)] to-[var(--tartarus-purple)] shrink-0" />

            <CardHeader className="pb-2">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--tartarus-teal-soft)]">
                  <Code className="h-5 w-5 text-[var(--tartarus-teal)]" />
                </div>
                <div className="min-w-0 flex-1 pr-8">
                  <CardTitle className="line-clamp-2 text-base font-semibold text-[var(--tartarus-ivory)]">
                    {doc.title}
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col pt-0">
              {/* Category badge */}
              {doc.metadata?.type && (
                <div className="mb-2">
                  <Badge
                    className={`px-2 py-0.5 text-[10px] font-medium ${getDocTypeColors(doc.metadata.type).barColor} text-white`}
                  >
                    {doc.metadata.type}
                  </Badge>
                  {doc.language && doc.language !== "en" && (
                    <Badge variant="outline" className="ml-1.5 px-1.5 py-0 text-[10px]">
                      {doc.language.toUpperCase()}
                    </Badge>
                  )}
                </div>
              )}

              {/* Summary (expandable) */}
              {doc.summary ? (
                <div
                  className="group/summary flex-1 cursor-pointer"
                  onClick={(e) => toggleSummary(doc.id, e)}
                >
                  <p
                    className={`text-[var(--tartarus-ivory-muted)] text-sm italic ${expandedSummaries.has(doc.id) ? "" : "line-clamp-3"}`}
                  >
                    {doc.summary}
                  </p>
                  <button className="mt-1 flex items-center gap-0.5 text-[10px] text-[var(--tartarus-teal)] opacity-70 group-hover/summary:opacity-100">
                    {expandedSummaries.has(doc.id) ? (
                      <>
                        Show less <ChevronUp className="h-3 w-3" />
                      </>
                    ) : (
                      <>
                        Show more <ChevronDown className="h-3 w-3" />
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="relative flex-1">
                  <pre className="text-[var(--tartarus-ivory-muted)] h-20 overflow-hidden rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-3 font-mono text-xs break-words whitespace-pre-wrap">
                    {doc.content.substring(0, 180)}...
                  </pre>
                  <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-6 rounded-b-lg bg-gradient-to-t from-[var(--tartarus-surface)] to-transparent" />
                </div>
              )}

              {/* Footer: Date + Tags */}
              <div className="mt-3 border-t border-[var(--tartarus-border)] pt-2">
                {doc.created_at && (
                  <div className="text-[var(--tartarus-ivory-faded)] mb-2 text-[10px]">
                    <Calendar className="mr-1 inline h-3 w-3" />
                    Added {formatMonthYear(doc.created_at)}
                  </div>
                )}
                {doc.metadata?.tags &&
                  Array.isArray(doc.metadata.tags) &&
                  doc.metadata.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {doc.metadata.tags.slice(0, 4).map((tag: string) => (
                        <span
                          key={tag}
                          className="rounded border border-[var(--tartarus-teal-dim)] bg-[var(--tartarus-teal-soft)] px-1.5 py-0.5 text-[9px] text-[var(--tartarus-teal)]"
                        >
                          {tag}
                        </span>
                      ))}
                      {doc.metadata.tags.length > 4 && (
                        <span className="text-[var(--tartarus-ivory-faded)] px-1.5 py-0.5 text-[9px]">
                          +{doc.metadata.tags.length - 4}
                        </span>
                      )}
                    </div>
                  )}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
