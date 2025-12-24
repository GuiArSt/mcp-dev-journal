"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mermaid from "mermaid";

interface MermaidPreviewProps {
  code: string;
  className?: string;
}

export function MermaidPreview({ code, className = "" }: MermaidPreviewProps) {
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const renderDiagram = useCallback(async () => {
    if (!previewRef.current || !code) return;

    try {
      setError(null);
      previewRef.current.innerHTML = "";

      // Generate unique ID to avoid conflicts
      const id = `mermaid-preview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const { svg } = await mermaid.render(id, code);
      previewRef.current.innerHTML = svg;

      // Make SVG responsive
      const svgElement = previewRef.current.querySelector("svg");
      if (svgElement) {
        svgElement.style.maxWidth = "100%";
        svgElement.style.height = "auto";
      }
    } catch (err: any) {
      setError(err.message || "Invalid diagram syntax");
    }
  }, [code]);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose",
    });
    renderDiagram();
  }, [renderDiagram]);

  if (error) {
    return (
      <div className={`p-4 text-sm text-red-400 bg-red-950/30 rounded ${className}`}>
        Mermaid error: {error}
      </div>
    );
  }

  return (
    <div
      ref={previewRef}
      className={`mermaid-preview overflow-auto ${className}`}
    />
  );
}
