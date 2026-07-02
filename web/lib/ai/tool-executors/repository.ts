import type { ToolExecutor } from "./types";

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizePortfolioStatus(status: unknown): "shipped" | "wip" | "archived" {
  const s = String(status || "").toLowerCase();
  if (s === "shipped" || s === "completed" || s === "done" || s === "production") return "shipped";
  if (s === "archived") return "archived";
  return "wip";
}

export const repositoryExecutors: Record<string, ToolExecutor> = {
  // === Documents ===
  repository_search_documents: async (args) => {
    const params = new URLSearchParams();
    if (args.type) params.set("type", String(args.type));
    if (args.search) params.set("search", String(args.search));
    if (args.limit) params.set("limit", String(args.limit));
    if (args.offset) params.set("offset", String(args.offset));

    const res = await fetch(`/api/documents?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to search documents");

    if (!data.documents || data.documents.length === 0) {
      return { output: "No documents found." };
    }

    const docList = data.documents
      .map((d: any) => {
        const tags = d.metadata?.tags?.join(", ") || "";
        return `• [${d.id}] ${d.title} (${d.type})${tags ? ` [${tags}]` : ""}`;
      })
      .join("\n");
    const paginationInfo = data.has_more
      ? `\n\nShowing ${data.documents.length} of ${data.total} documents. Use offset=${data.offset + data.documents.length} to see more.`
      : `\n\nFound ${data.total} total document(s).`;
    return {
      output: `Found ${data.documents.length} document(s):\n${docList}${paginationInfo}`,
    };
  },

  repository_get_document: async (args) => {
    let url = "/api/documents";
    if (args.id) url += `/${args.id}`;
    else if (args.slug) url += `/${encodeURIComponent(String(args.slug))}`;
    else throw new Error("Either id or slug is required");

    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Document not found");

    const doc = data.document || data;
    let docOutput = `**${doc.title}** (ID: ${doc.id})\nType: ${doc.type}\nSlug: ${doc.slug}\n\n${doc.content}`;

    if (doc.media_count > 0 && doc.media_assets) {
      docOutput += `\n\n---\n**Attached Media (${doc.media_count}):**\n`;
      for (const media of doc.media_assets) {
        const alt = media.alt || media.description || media.filename;
        docOutput += `\n- **${media.filename}** (ID: ${media.id})\n`;
        if (media.description)
          docOutput += `  Description: ${media.description}\n`;
        docOutput += `  ![${alt}](${media.url})\n`;
      }
    }

    return { output: docOutput };
  },

  repository_create_document: async (args) => {
    const slug = String(args.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const metadata = {
      ...(args.metadata || {}),
      tags: args.tags || [],
    };

    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: args.title,
        slug,
        type: args.type || "writing",
        content: args.content,
        metadata,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create document");
    return {
      output: `✅ Created document: "${args.title}"\nID: ${data.id}\nSlug: ${slug}`,
    };
  },

  repository_update_document: async (args) => {
    // First fetch existing doc to merge metadata
    const getRes = await fetch(`/api/documents/${args.id}`);
    if (!getRes.ok) {
      const errData = await getRes.json();
      throw new Error(errData.error || "Document not found");
    }
    const existingDoc = await getRes.json();
    const existingMeta = existingDoc.metadata || {};

    const updateData: any = {};
    if (args.title) updateData.title = args.title;
    if (args.content) updateData.content = args.content;

    if (args.tags || args.metadata) {
      updateData.metadata = {
        ...existingMeta,
        ...(args.metadata || {}),
        tags: args.tags ?? existingMeta.tags,
      };
    }

    const res = await fetch(`/api/documents/${args.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update document");
    return {
      output: `✅ Updated document #${args.id}: "${existingDoc.title}"`,
    };
  },

  // === Skills ===
  repository_list_skills: async (args) => {
    const res = await fetch("/api/cv");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to list skills");

    let skills = data.skills || [];
    if (args.category) {
      skills = skills.filter((s: any) => s.category === args.category);
    }

    if (skills.length === 0) {
      return { output: "No skills found." };
    }

    const skillList = skills
      .map(
        (s: any) =>
          `• ${s.name} [${s.category}] - ${s.magnitude}/5 - ${s.description || "No description"}`
      )
      .join("\n");
    return { output: `Found ${skills.length} skill(s):\n${skillList}` };
  },

  repository_create_skill: async (args) => {
    const res = await fetch("/api/cv/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: args.id,
        name: args.name,
        category: args.category,
        magnitude: args.magnitude,
        description: args.description,
        icon: args.icon,
        color: args.color,
        url: args.url,
        tags: args.tags || [],
        firstUsed: args.firstUsed,
        lastUsed: args.lastUsed,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create skill");
    return {
      output: `✅ Created new skill: ${args.name} (${args.category}) - ${args.magnitude}/5`,
    };
  },

  repository_update_skill: async (args) => {
    const res = await fetch(`/api/cv/skills/${args.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: args.name,
        category: args.category,
        magnitude: args.magnitude,
        description: args.description,
        tags: args.tags,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update skill");
    return { output: `✅ Updated skill: ${args.id}` };
  },

  // === Experience ===
  repository_list_experience: async () => {
    const res = await fetch("/api/cv");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to list experience");

    const exp = data.experience || [];
    if (exp.length === 0) {
      return { output: "No work experience found." };
    }

    const expList = exp
      .map(
        (e: any) =>
          `• ${e.title} at ${e.company} (${e.dateStart} - ${e.dateEnd || "Present"})\n  ${e.tagline || ""}`
      )
      .join("\n");
    return { output: `Found ${exp.length} experience(s):\n${expList}` };
  },

  repository_create_experience: async (args) => {
    const res = await fetch("/api/cv/experience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: args.id,
        title: args.title,
        company: args.company,
        department: args.department,
        location: args.location,
        dateStart: args.dateStart,
        dateEnd: args.dateEnd,
        tagline: args.tagline,
        note: args.note,
        achievements: args.achievements || [],
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create experience");
    return {
      output: `✅ Created new work experience: ${args.title} at ${args.company}`,
    };
  },

  repository_update_experience: async (args) => {
    const res = await fetch(`/api/cv/experience/${args.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: args.title,
        company: args.company,
        tagline: args.tagline,
        achievements: args.achievements,
        dateStart: args.dateStart,
        dateEnd: args.dateEnd,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update experience");
    return { output: `✅ Updated experience: ${data.title || args.id}` };
  },

  // === Education ===
  repository_list_education: async () => {
    const res = await fetch("/api/cv");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to list education");

    const edu = data.education || [];
    if (edu.length === 0) {
      return { output: "No education found." };
    }

    const eduList = edu
      .map(
        (e: any) =>
          `• ${e.degree} in ${e.field} - ${e.institution} (${e.dateStart} - ${e.dateEnd})`
      )
      .join("\n");
    return { output: `Found ${edu.length} education(s):\n${eduList}` };
  },

  repository_create_education: async (args) => {
    const res = await fetch("/api/cv/education", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: args.id,
        degree: args.degree,
        field: args.field,
        institution: args.institution,
        location: args.location,
        dateStart: args.dateStart,
        dateEnd: args.dateEnd,
        tagline: args.tagline,
        note: args.note,
        focusAreas: args.focusAreas || [],
        achievements: args.achievements || [],
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create education");
    return {
      output: `✅ Created new education: ${args.degree} in ${args.field} at ${args.institution}`,
    };
  },

  repository_update_education: async (args) => {
    const res = await fetch(`/api/cv/education/${args.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        degree: args.degree,
        field: args.field,
        institution: args.institution,
        tagline: args.tagline,
        focusAreas: args.focusAreas,
        achievements: args.achievements,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update education");
    return { output: `✅ Updated education: ${data.degree || args.id}` };
  },

  // === Portfolio Projects ===
  repository_list_portfolio_projects: async (args) => {
    const params = new URLSearchParams();
    if (args.featured !== undefined)
      params.set("featured", String(args.featured));
    if (args.status) params.set("status", String(args.status));

    const res = await fetch(`/api/portfolio-projects?${params.toString()}`);
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || "Failed to list portfolio projects");

    const projects = data.projects || data;
    return {
      output: `📁 **Portfolio Projects** (${projects.length} found)\n\n${projects
        .map(
          (p: any) =>
            `- **${p.title}** [id: \`${p.id}\`] (${p.category}) ${p.featured ? "⭐" : ""}\n  Status: ${p.status} | Technologies: ${(p.technologies || []).join(", ")}`
        )
        .join("\n\n")}`,
    };
  },

  repository_get_portfolio_project: async (args) => {
    const res = await fetch(`/api/portfolio-projects/${args.id}`);
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || "Failed to get portfolio project");

    return {
      output:
        `📁 **${data.title}**\n\n` +
        `**Category:** ${data.category}\n` +
        `**Status:** ${data.status} ${data.featured ? "⭐ Featured" : ""}\n` +
        (data.company ? `**Company:** ${data.company}\n` : "") +
        (data.role ? `**Role:** ${data.role}\n` : "") +
        `**Technologies:** ${(data.technologies || []).join(", ")}\n` +
        (data.tags?.length ? `**Tags:** ${data.tags.join(", ")}\n` : "") +
        (data.description ? `\n---\n\n${data.description}` : ""),
    };
  },

  repository_create_portfolio_project: async (args) => {
    const id = args.id ? String(args.id) : toSlug(String(args.title || "portfolio-project"));
    const res = await fetch("/api/portfolio-projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        title: args.title,
        category: args.category,
        company: args.company,
        role: args.role,
        status: normalizePortfolioStatus(args.status),
        featured: args.featured || false,
        technologies: args.technologies || [],
        tags: args.tags || [],
        description: args.description,
        excerpt: args.excerpt,
        image: args.image || args.image_url,
        productIds: args.productIds || [],
        visible: args.visible,
        diagramImage: args.diagramImage,
        imageFallback: args.imageFallback,
        caseStudyLevel: args.caseStudyLevel,
        humaneProblem: args.humaneProblem,
        humaneSolution: args.humaneSolution,
        technicalProblem: args.technicalProblem,
        technicalSolution: args.technicalSolution,
        technicalSpecs: args.technicalSpecs,
      }),
    });

    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || "Failed to create portfolio project");
    return {
      output: `✅ Created portfolio project: **${args.title}** (id: \`${data.id || id}\`)`,
    };
  },

  repository_update_portfolio_project: async (args) => {
    const res = await fetch(`/api/portfolio-projects/${args.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: args.title,
        category: args.category,
        company: args.company,
        role: args.role,
        status: args.status ? normalizePortfolioStatus(args.status) : undefined,
        featured: args.featured,
        technologies: args.technologies,
        tags: args.tags,
        description: args.description,
        excerpt: args.excerpt,
        image: args.image || args.image_url,
        productIds: args.productIds,
        visible: args.visible,
        diagramImage: args.diagramImage,
        imageFallback: args.imageFallback,
        caseStudyLevel: args.caseStudyLevel,
        humaneProblem: args.humaneProblem,
        humaneSolution: args.humaneSolution,
        technicalProblem: args.technicalProblem,
        technicalSolution: args.technicalSolution,
        technicalSpecs: args.technicalSpecs,
      }),
    });

    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || "Failed to update portfolio project");
    return {
      output: `✅ Updated portfolio project: **${data.title || args.id}**`,
    };
  },

  repository_list_portfolio_products: async (args) => {
    const params = new URLSearchParams();
    if (args.wildcard !== undefined) params.set("wildcard", String(args.wildcard));

    const res = await fetch(`/api/portfolio-products?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to list portfolio products");

    const products = data.products || data;
    return {
      output: `🛒 **Portfolio Products** (${products.length} found)\n\n${products
        .map(
          (p: any) =>
            `- **${p.title}** [id: \`${p.id}\`] — ${p.tagline}\n  ${p.startingPrice} · ${p.timeline}${p.wildcard ? " · wildcard" : ""}`
        )
        .join("\n\n")}`,
    };
  },

  repository_get_portfolio_product: async (args) => {
    const res = await fetch(`/api/portfolio-products/${args.id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to get portfolio product");

    return {
      output:
        `🛒 **${data.title}**\n\n` +
        `**Tagline:** ${data.tagline}\n` +
        `**Promise:** ${data.promise}\n` +
        `**Price:** ${data.startingPrice} · **Timeline:** ${data.timeline}\n\n` +
        `${data.humaneDescription}\n\n` +
        `**Deliverables:**\n${(data.deliverables || []).map((d: string) => `- ${d}`).join("\n")}`,
    };
  },

  repository_create_portfolio_product: async (args) => {
    const res = await fetch("/api/portfolio-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: args.id,
        title: args.title,
        tagline: args.tagline,
        humaneDescription: args.humaneDescription,
        buyerPain: args.buyerPain,
        promise: args.promise,
        deliverables: args.deliverables || [],
        startingPrice: args.startingPrice,
        timeline: args.timeline,
        ctaLabel: args.ctaLabel,
        accent: args.accent || "gold",
        wildcard: args.wildcard || false,
        displayOrder: args.displayOrder ?? 0,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create portfolio product");
    return {
      output: `✅ Created portfolio product: **${args.title}** (id: \`${data.id || args.id}\`)`,
    };
  },

  repository_update_portfolio_product: async (args) => {
    const res = await fetch(`/api/portfolio-products/${args.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: args.title,
        tagline: args.tagline,
        humaneDescription: args.humaneDescription,
        buyerPain: args.buyerPain,
        promise: args.promise,
        deliverables: args.deliverables,
        startingPrice: args.startingPrice,
        timeline: args.timeline,
        ctaLabel: args.ctaLabel,
        accent: args.accent,
        wildcard: args.wildcard,
        displayOrder: args.displayOrder,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update portfolio product");
    return {
      output: `✅ Updated portfolio product: **${data.title || args.id}**`,
    };
  },
};
