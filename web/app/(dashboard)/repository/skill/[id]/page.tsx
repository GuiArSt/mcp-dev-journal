"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Edit, Save, X, Cpu, Palette, Database, Server, PenTool, Users, Tag, ExternalLink, Calendar, Star, Upload, ImageIcon } from "lucide-react";
import { getSkillIconUrl } from "@/lib/skill-icons";

interface Skill {
  id: string;
  name: string;
  category: string;
  magnitude: number;
  description: string;
  icon?: string;
  color?: string;
  url?: string;
  tags: string[];
  firstUsed?: string;
  lastUsed?: string;
}

const CATEGORIES = [
  "AI & Development",
  "Languages & Frameworks",
  "Data & Analytics",
  "Infrastructure & DevOps",
  "Design & UX",
  "Leadership & Collaboration",
];

// Tartarus-inspired category theming
const CATEGORY_CONFIG: Record<string, { accent: string; accentBg: string; icon: React.ReactNode }> = {
  "AI & Development": {
    accent: "text-[var(--tartarus-teal)]",
    accentBg: "bg-[var(--tartarus-teal-soft)]",
    icon: <Cpu className="h-5 w-5" />
  },
  "Languages & Frameworks": {
    accent: "text-[var(--tartarus-teal)]",
    accentBg: "bg-[var(--tartarus-teal-soft)]",
    icon: <Database className="h-5 w-5" />
  },
  "Data & Analytics": {
    accent: "text-[var(--tartarus-teal)]",
    accentBg: "bg-[var(--tartarus-teal-soft)]",
    icon: <Database className="h-5 w-5" />
  },
  "Infrastructure & DevOps": {
    accent: "text-[var(--tartarus-gold)]",
    accentBg: "bg-[var(--tartarus-gold-soft)]",
    icon: <Server className="h-5 w-5" />
  },
  "Design & UX": {
    accent: "text-[var(--tartarus-gold)]",
    accentBg: "bg-[var(--tartarus-gold-soft)]",
    icon: <Palette className="h-5 w-5" />
  },
  "Leadership & Collaboration": {
    accent: "text-[var(--tartarus-gold)]",
    accentBg: "bg-[var(--tartarus-gold-soft)]",
    icon: <Users className="h-5 w-5" />
  },
};

export default function SkillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const skillId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedSkill, setEditedSkill] = useState<Partial<Skill>>({});
  const [newTag, setNewTag] = useState("");
  const [iconError, setIconError] = useState(false);

  useEffect(() => {
    fetchSkill();
  }, [skillId]);

  const fetchSkill = async () => {
    try {
      const res = await fetch(`/api/cv/skills/${skillId}`);
      if (res.ok) {
        const data = await res.json();
        setSkill(data);
        setEditedSkill(data);
      }
    } catch (error) {
      console.error("Failed to fetch skill:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!skill) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cv/skills/${skillId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editedSkill),
      });
      if (res.ok) {
        const updated = await res.json();
        setSkill(updated);
        setIsEditing(false);
        setIconError(false);
      }
    } catch (error) {
      console.error("Failed to save skill:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to base64 data URL for storage
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setEditedSkill({ ...editedSkill, icon: dataUrl });
      setIconError(false);
    };
    reader.readAsDataURL(file);
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !editedSkill.tags?.includes(tag)) {
      setEditedSkill({ ...editedSkill, tags: [...(editedSkill.tags || []), tag] });
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setEditedSkill({ ...editedSkill, tags: editedSkill.tags?.filter(t => t !== tagToRemove) || [] });
  };

  const editWithKronus = () => {
    if (!skill) return;
    const context = `I want to UPDATE this skill in my CV. Please help me modify it using the repository_update_skill tool.

**Current Skill:**
- **ID:** ${skill.id}
- **Name:** ${skill.name}
- **Category:** ${skill.category}
- **Magnitude:** ${skill.magnitude}/5
- **Description:** ${skill.description}
${skill.tags?.length ? `- **Tags:** ${skill.tags.join(", ")}` : ""}
${skill.firstUsed ? `- **First Used:** ${skill.firstUsed}` : ""}
${skill.lastUsed ? `- **Last Used:** ${skill.lastUsed}` : ""}

What would you like to change?`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  };

  const config = skill ? CATEGORY_CONFIG[skill.category] || CATEGORY_CONFIG["AI & Development"] : CATEGORY_CONFIG["AI & Development"];

  // Determine which icon to show
  const getIconDisplay = () => {
    // Priority: custom icon > skill-icons library > category fallback
    const customIcon = isEditing ? editedSkill.icon : skill?.icon;
    const libraryIcon = getSkillIconUrl(skill?.name || "");

    if (customIcon) {
      return (
        <img
          src={customIcon}
          alt={skill?.name}
          className="h-12 w-12 object-contain"
          onError={() => setIconError(true)}
        />
      );
    }

    if (libraryIcon && !iconError) {
      return (
        <img
          src={libraryIcon}
          alt={skill?.name}
          className="h-12 w-12 object-contain"
          onError={() => setIconError(true)}
        />
      );
    }

    // Fallback to category icon
    return <span className={config.accent}>{config.icon}</span>;
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col p-6 bg-[var(--tartarus-void)]">
        <Skeleton className="mb-4 h-8 w-1/3 bg-[var(--tartarus-elevated)]" />
        <Skeleton className="h-96 w-full bg-[var(--tartarus-elevated)]" />
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--tartarus-void)]">
        <p className="text-[var(--tartarus-ivory-muted)]">Skill not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--tartarus-void)]">
      {/* Header */}
      <header className="flex h-14 items-center justify-between px-6 border-b border-[var(--tartarus-border)]">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/repository?tab=cv")}
            className="text-[var(--tartarus-ivory-muted)] hover:text-[var(--tartarus-ivory)] hover:bg-[var(--tartarus-elevated)]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-lg font-semibold text-[var(--tartarus-ivory)]">{skill.name}</h1>
          <Badge className={`${config.accentBg} ${config.accent}`}>
            {skill.category}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setIsEditing(false); setEditedSkill(skill); setIconError(false); }}
                className="border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)] hover:bg-[var(--tartarus-elevated)]"
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-[var(--tartarus-teal)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-teal-bright)]"
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)] hover:bg-[var(--tartarus-elevated)]"
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                size="sm"
                onClick={editWithKronus}
                className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold-bright)]"
              >
                <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 mr-2 rounded-full object-cover" />
                Edit with Kronus
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {/* Hero Card */}
          <Card className="overflow-hidden border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] shadow-lg mb-6">
            {/* Header with gradient */}
            <div className="h-32 bg-gradient-to-r from-[var(--tartarus-deep)] to-[var(--tartarus-surface)] relative border-b border-[var(--tartarus-border)]">
              <div className="absolute bottom-4 left-6 flex items-center gap-4">
                {/* Icon Container */}
                <div className="h-20 w-20 rounded-xl bg-[var(--tartarus-elevated)] border border-[var(--tartarus-border)] shadow-lg flex items-center justify-center relative group">
                  {getIconDisplay()}

                  {/* Upload overlay when editing */}
                  {isEditing && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Upload className="h-6 w-6 text-white" />
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.svg"
                    onChange={handleIconUpload}
                    className="hidden"
                  />
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-[var(--tartarus-ivory)]">{skill.name}</h2>
                  <p className={`text-sm ${config.accent}`}>{skill.category}</p>
                </div>
              </div>
            </div>

            <CardContent className="pt-6 space-y-6">
              {/* Custom Icon URL (when editing) */}
              {isEditing && (
                <div>
                  <Label className="text-sm font-medium text-[var(--tartarus-ivory-muted)] mb-2 block">
                    <ImageIcon className="h-3 w-3 inline mr-1" />
                    Custom Icon URL (or upload above)
                  </Label>
                  <Input
                    value={editedSkill.icon || ""}
                    onChange={(e) => { setEditedSkill({ ...editedSkill, icon: e.target.value }); setIconError(false); }}
                    placeholder="https://... or paste SVG data URL"
                    className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                  />
                  <p className="text-xs text-[var(--tartarus-ivory-faded)] mt-1">
                    Supports: PNG, SVG, JPG. Leave empty to use auto-detected icon.
                  </p>
                </div>
              )}

              {/* Proficiency Level */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[var(--tartarus-ivory-muted)]">Proficiency Level</span>
                  <span className="text-sm font-bold text-[var(--tartarus-ivory)]">{skill.magnitude}/5</span>
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        onClick={() => setEditedSkill({ ...editedSkill, magnitude: level })}
                        className={`h-8 flex-1 rounded-lg transition-all border ${
                          level <= (editedSkill.magnitude || 0)
                            ? "bg-[var(--tartarus-teal)] border-[var(--tartarus-teal)] text-[var(--tartarus-void)]"
                            : "bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory-faded)] hover:border-[var(--tartarus-teal-dim)]"
                        }`}
                      >
                        <Star className={`h-4 w-4 mx-auto ${level <= (editedSkill.magnitude || 0) ? "fill-current" : ""}`} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        className={`h-3 flex-1 rounded-full ${
                          level <= skill.magnitude
                            ? "bg-[var(--tartarus-teal)]"
                            : "bg-[var(--tartarus-deep)]"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <Label className="text-sm font-medium text-[var(--tartarus-ivory-muted)] mb-2 block">Description</Label>
                {isEditing ? (
                  <Textarea
                    value={editedSkill.description || ""}
                    onChange={(e) => setEditedSkill({ ...editedSkill, description: e.target.value })}
                    className="min-h-[100px] bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                  />
                ) : (
                  <p className="text-[var(--tartarus-ivory)] leading-relaxed">{skill.description}</p>
                )}
              </div>

              {/* Category (when editing) */}
              {isEditing && (
                <div>
                  <Label className="text-sm font-medium text-[var(--tartarus-ivory-muted)] mb-2 block">Category</Label>
                  <Select
                    value={editedSkill.category}
                    onValueChange={(value) => setEditedSkill({ ...editedSkill, category: value })}
                  >
                    <SelectTrigger className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--tartarus-surface)] border-[var(--tartarus-border)]">
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat} className="text-[var(--tartarus-ivory)] focus:bg-[var(--tartarus-elevated)]">
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Timeline */}
              {(skill.firstUsed || skill.lastUsed || isEditing) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-[var(--tartarus-ivory-muted)] mb-2 block">
                      <Calendar className="h-3 w-3 inline mr-1" />
                      First Used
                    </Label>
                    {isEditing ? (
                      <Input
                        value={editedSkill.firstUsed || ""}
                        onChange={(e) => setEditedSkill({ ...editedSkill, firstUsed: e.target.value })}
                        placeholder="e.g., 2020"
                        className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                      />
                    ) : (
                      <p className="text-[var(--tartarus-ivory)]">{skill.firstUsed || "—"}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-[var(--tartarus-ivory-muted)] mb-2 block">
                      <Calendar className="h-3 w-3 inline mr-1" />
                      Last Used
                    </Label>
                    {isEditing ? (
                      <Input
                        value={editedSkill.lastUsed || ""}
                        onChange={(e) => setEditedSkill({ ...editedSkill, lastUsed: e.target.value })}
                        placeholder="e.g., Present"
                        className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                      />
                    ) : (
                      <p className="text-[var(--tartarus-ivory)]">{skill.lastUsed || "—"}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Reference URL */}
              {(skill.url || isEditing) && (
                <div>
                  <Label className="text-sm font-medium text-[var(--tartarus-ivory-muted)] mb-2 block">
                    <ExternalLink className="h-3 w-3 inline mr-1" />
                    Reference URL
                  </Label>
                  {isEditing ? (
                    <Input
                      value={editedSkill.url || ""}
                      onChange={(e) => setEditedSkill({ ...editedSkill, url: e.target.value })}
                      placeholder="https://..."
                      className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                    />
                  ) : skill.url ? (
                    <a
                      href={skill.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--tartarus-teal)] hover:text-[var(--tartarus-teal-bright)] hover:underline"
                    >
                      {skill.url}
                    </a>
                  ) : null}
                </div>
              )}

              {/* Tags */}
              <div>
                <Label className="text-sm font-medium text-[var(--tartarus-ivory-muted)] mb-2 block">
                  <Tag className="h-3 w-3 inline mr-1" />
                  Tags
                </Label>
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {editedSkill.tags?.map((tag) => (
                        <Badge key={tag} variant="secondary" className="bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)] pr-1">
                          {tag}
                          <button onClick={() => removeTag(tag)} className="ml-1 hover:text-[var(--tartarus-error)]">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="Add tag..."
                        className="max-w-xs bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addTag}
                        className="border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-soft)]"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {skill.tags?.length > 0 ? (
                      skill.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)]">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-[var(--tartarus-ivory-faded)] text-sm italic">No tags</span>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
