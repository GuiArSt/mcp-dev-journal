"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Edit, Save, X, Briefcase, MapPin, Calendar, Building2, ChevronRight, Upload } from "lucide-react";

interface Achievement {
  category?: string;
  description: string;
  metrics?: string;
  tags?: string[];
}

interface WorkExperience {
  id: string;
  title: string;
  company: string;
  department?: string;
  location: string;
  dateStart: string;
  dateEnd: string | null;
  tagline: string;
  note?: string;
  achievements: Achievement[];
  logo?: string;
}

export default function ExperienceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const expId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [experience, setExperience] = useState<WorkExperience | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedExp, setEditedExp] = useState<Partial<WorkExperience>>({});

  useEffect(() => {
    fetchExperience();
  }, [expId]);

  const fetchExperience = async () => {
    try {
      const res = await fetch(`/api/cv/experience/${expId}`);
      if (res.ok) {
        const data = await res.json();
        setExperience(data);
        setEditedExp(data);
      }
    } catch (error) {
      console.error("Failed to fetch experience:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!experience) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cv/experience/${expId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editedExp),
      });
      if (res.ok) {
        const updated = await res.json();
        setExperience(updated);
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Failed to save experience:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setEditedExp({ ...editedExp, logo: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const editWithKronus = () => {
    if (!experience) return;
    const achievementsSummary = experience.achievements?.slice(0, 3).map(a => `- ${a.description}`).join("\n") || "";
    const context = `I want to UPDATE this work experience in my CV. Please help me modify it using the repository tools.

**Current Experience:**
- **ID:** ${experience.id}
- **Title:** ${experience.title}
- **Company:** ${experience.company}
${experience.department ? `- **Department:** ${experience.department}` : ""}
- **Location:** ${experience.location}
- **Period:** ${experience.dateStart} - ${experience.dateEnd || "Present"}
- **Tagline:** ${experience.tagline}
${experience.note ? `- **Note:** ${experience.note}` : ""}

**Sample Achievements (${experience.achievements?.length || 0} total):**
${achievementsSummary}

What would you like to change?`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  };

  const isCurrent = !experience?.dateEnd;

  // Group achievements by category
  const achievementsByCategory = experience?.achievements?.reduce((acc, ach) => {
    const cat = ach.category || "General";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ach);
    return acc;
  }, {} as Record<string, Achievement[]>) || {};

  // Get logo to display
  const displayLogo = isEditing ? editedExp.logo : experience?.logo;

  if (loading) {
    return (
      <div className="flex h-full flex-col p-6 bg-[var(--tartarus-void)]">
        <Skeleton className="mb-4 h-8 w-1/3 bg-[var(--tartarus-elevated)]" />
        <Skeleton className="h-96 w-full bg-[var(--tartarus-elevated)]" />
      </div>
    );
  }

  if (!experience) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--tartarus-void)]">
        <p className="text-[var(--tartarus-ivory-muted)]">Experience not found</p>
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
          <h1 className="text-lg font-semibold text-[var(--tartarus-ivory)]">{experience.title}</h1>
          {isCurrent && (
            <Badge className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)]">Current</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setIsEditing(false); setEditedExp(experience); }}
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
        <div className="max-w-4xl mx-auto">
          {/* Hero Card */}
          <Card className="overflow-hidden border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] shadow-lg mb-6">
            {/* Header with gradient */}
            <div className={`h-40 bg-gradient-to-r ${isCurrent ? "from-[var(--tartarus-gold-dim)] to-[var(--tartarus-surface)]" : "from-[var(--tartarus-deep)] to-[var(--tartarus-surface)]"} relative border-b border-[var(--tartarus-border)]`}>
              <div className="absolute bottom-4 left-6 right-6">
                <div className="flex items-end justify-between">
                  <div className="flex items-center gap-4">
                    {/* Logo Container - Clickable when editing */}
                    <div
                      className={`h-20 w-20 rounded-xl bg-[var(--tartarus-elevated)] border border-[var(--tartarus-border)] shadow-lg flex items-center justify-center relative group ${isEditing ? "cursor-pointer" : ""}`}
                      onClick={() => isEditing && fileInputRef.current?.click()}
                    >
                      {displayLogo ? (
                        <img
                          src={displayLogo}
                          alt={experience.company}
                          className="h-14 w-14 object-contain"
                        />
                      ) : (
                        <Briefcase className={`h-10 w-10 ${isCurrent ? "text-[var(--tartarus-gold)]" : "text-[var(--tartarus-ivory-muted)]"}`} />
                      )}

                      {/* Upload overlay when editing */}
                      {isEditing && (
                        <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Upload className="h-6 w-6 text-white" />
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.svg"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </div>

                    <div>
                      {isEditing ? (
                        <Input
                          value={editedExp.title || ""}
                          onChange={(e) => setEditedExp({ ...editedExp, title: e.target.value })}
                          className="text-2xl font-bold bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] mb-1"
                        />
                      ) : (
                        <h2 className="text-2xl font-bold text-[var(--tartarus-ivory)]">{experience.title}</h2>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Building2 className="h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
                        {isEditing ? (
                          <Input
                            value={editedExp.company || ""}
                            onChange={(e) => setEditedExp({ ...editedExp, company: e.target.value })}
                            className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] h-7 text-sm"
                          />
                        ) : (
                          <span className={`${isCurrent ? "text-[var(--tartarus-gold)]" : "text-[var(--tartarus-ivory-muted)]"}`}>{experience.company}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {isCurrent && (
                    <Badge className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] font-semibold">
                      Currently Working
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <CardContent className="pt-6">
              {/* Logo URL (when editing) */}
              {isEditing && (
                <div className="mb-6">
                  <Label className="text-sm font-medium text-[var(--tartarus-ivory-muted)] mb-2 block">
                    Logo URL (or click image above to upload)
                  </Label>
                  <Input
                    value={editedExp.logo || ""}
                    onChange={(e) => setEditedExp({ ...editedExp, logo: e.target.value })}
                    placeholder="https://... or upload above"
                    className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                  />
                </div>
              )}

              {/* Meta Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-6 border-b border-[var(--tartarus-border)]">
                <div>
                  <Label className="text-xs text-[var(--tartarus-ivory-muted)] mb-1 block">Department</Label>
                  {isEditing ? (
                    <Input
                      value={editedExp.department || ""}
                      onChange={(e) => setEditedExp({ ...editedExp, department: e.target.value })}
                      placeholder="e.g., Engineering"
                      className="h-8 text-sm bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                    />
                  ) : (
                    <p className="text-sm font-medium text-[var(--tartarus-ivory)]">{experience.department || "—"}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-[var(--tartarus-ivory-muted)] mb-1 block flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Location
                  </Label>
                  {isEditing ? (
                    <Input
                      value={editedExp.location || ""}
                      onChange={(e) => setEditedExp({ ...editedExp, location: e.target.value })}
                      className="h-8 text-sm bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]"
                    />
                  ) : (
                    <p className="text-sm font-medium text-[var(--tartarus-ivory)]">{experience.location}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-[var(--tartarus-ivory-muted)] mb-1 block flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Start Date
                  </Label>
                  {isEditing ? (
                    <Input
                      value={editedExp.dateStart || ""}
                      onChange={(e) => setEditedExp({ ...editedExp, dateStart: e.target.value })}
                      placeholder="e.g., 2022-01"
                      className="h-8 text-sm bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                    />
                  ) : (
                    <p className="text-sm font-medium text-[var(--tartarus-ivory)]">{experience.dateStart}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-[var(--tartarus-ivory-muted)] mb-1 block flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> End Date
                  </Label>
                  {isEditing ? (
                    <Input
                      value={editedExp.dateEnd || ""}
                      onChange={(e) => setEditedExp({ ...editedExp, dateEnd: e.target.value || null })}
                      placeholder="Leave empty for current"
                      className="h-8 text-sm bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                    />
                  ) : (
                    <p className="text-sm font-medium text-[var(--tartarus-ivory)]">{experience.dateEnd || "Present"}</p>
                  )}
                </div>
              </div>

              {/* Tagline */}
              <div className="mb-6">
                <Label className="text-sm font-medium text-[var(--tartarus-ivory-muted)] mb-2 block">Tagline</Label>
                {isEditing ? (
                  <Input
                    value={editedExp.tagline || ""}
                    onChange={(e) => setEditedExp({ ...editedExp, tagline: e.target.value })}
                    className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]"
                  />
                ) : (
                  <p className={`text-lg italic ${isCurrent ? "text-[var(--tartarus-gold)]" : "text-[var(--tartarus-ivory-muted)]"}`}>
                    "{experience.tagline}"
                  </p>
                )}
              </div>

              {/* Note */}
              {(experience.note || isEditing) && (
                <div className="mb-6">
                  <Label className="text-sm font-medium text-[var(--tartarus-ivory-muted)] mb-2 block">Note</Label>
                  {isEditing ? (
                    <Textarea
                      value={editedExp.note || ""}
                      onChange={(e) => setEditedExp({ ...editedExp, note: e.target.value })}
                      placeholder="Additional context..."
                      className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                    />
                  ) : experience.note ? (
                    <div className={`p-4 rounded-lg border ${isCurrent ? "bg-[var(--tartarus-gold-soft)] border-[var(--tartarus-gold-dim)]" : "bg-[var(--tartarus-elevated)] border-[var(--tartarus-border)]"}`}>
                      <p className="text-sm text-[var(--tartarus-ivory)]">{experience.note}</p>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Achievements Section */}
          {experience.achievements && experience.achievements.length > 0 && (
            <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-[var(--tartarus-ivory)]">
                  <ChevronRight className={`h-5 w-5 ${isCurrent ? "text-[var(--tartarus-gold)]" : "text-[var(--tartarus-teal)]"}`} />
                  Key Achievements
                  <Badge variant="secondary" className="ml-2 bg-[var(--tartarus-elevated)] text-[var(--tartarus-ivory-muted)]">
                    {experience.achievements.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {Object.entries(achievementsByCategory).map(([category, achievements]) => (
                  <div key={category}>
                    <h4 className={`text-sm font-semibold uppercase tracking-wide mb-3 ${isCurrent ? "text-[var(--tartarus-gold)]" : "text-[var(--tartarus-teal)]"}`}>
                      {category}
                    </h4>
                    <div className="space-y-3">
                      {achievements.map((ach, i) => (
                        <div
                          key={i}
                          className={`p-4 rounded-lg border ${isCurrent ? "bg-[var(--tartarus-gold-soft)] border-[var(--tartarus-gold-dim)]" : "bg-[var(--tartarus-elevated)] border-[var(--tartarus-border)]"}`}
                        >
                          <p className="text-sm text-[var(--tartarus-ivory)]">{ach.description}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {ach.metrics && (
                              <Badge variant="outline" className={`text-xs ${isCurrent ? "border-[var(--tartarus-gold-dim)] text-[var(--tartarus-gold)]" : "border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)]"}`}>
                                {ach.metrics}
                              </Badge>
                            )}
                            {ach.tags?.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory-muted)]">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
