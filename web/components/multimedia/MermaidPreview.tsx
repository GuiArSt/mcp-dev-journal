"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mermaid from "mermaid";

interface MermaidPreviewProps {
  code: string;
  className?: string;
  theme?: "dark" | "default" | "base" | "forest" | "neutral";
}

export function MermaidPreview({ code, className = "", theme = "dark" }: MermaidPreviewProps) {
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
      theme,
      themeVariables: theme === "base"
        ? {
            background: "#f8f2e4",
            mainBkg: "#fffaf0",
            secondBkg: "#efe2c8",
            tertiaryBkg: "#f5ead5",
            primaryColor: "#fffaf0",
            primaryTextColor: "#2f2922",
            primaryBorderColor: "#b45a43",
            lineColor: "#8f3f2e",
            textColor: "#2f2922",
            fontFamily: "ui-serif, Georgia, serif",
            nodeBorder: "#b45a43",
            clusterBkg: "#efe2c8",
            clusterBorder: "#c59b71",
            edgeLabelBackground: "#fffaf0",
          }
        : undefined,
      securityLevel: "loose",
    });
    renderDiagram();
  }, [renderDiagram]);

  if (error) {
    return (
      <div className={`rounded bg-red-950/30 p-4 text-sm text-red-400 ${className}`}>
        Mermaid error: {error}
      </div>
    );
  }

  return <div ref={previewRef} className={`mermaid-preview overflow-auto ${className}`} />;
}
