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
import {
  ArrowLeft,
  Edit,
  Save,
  X,
  GraduationCap,
  MapPin,
  Calendar,
  BookOpen,
  Award,
  Plus,
  Target,
  Upload,
} from "lucide-react";

interface Education {
  id: string;
  degree: string;
  field: string;
  institution: string;
  location: string;
  dateStart: string;
  dateEnd: string;
  tagline: string;
  note?: string;
  focusAreas: string[];
  achievements: string[];
  logo?: string;
}

export default function EducationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eduId = params.id as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [education, setEducation] = useState<Education | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedEdu, setEditedEdu] = useState<Partial<Education>>({});
  const [newFocusArea, setNewFocusArea] = useState("");
  const [newAchievement, setNewAchievement] = useState("");

  useEffect(() => {
    fetchEducation();
  }, [eduId]);

  const fetchEducation = async () => {
    try {
      const res = await fetch(`/api/cv/education/${eduId}`);
      if (res.ok) {
        const data = await res.json();
        setEducation(data);
        setEditedEdu(data);
      }
    } catch (error) {
      console.error("Failed to fetch education:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!education) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/cv/education/${eduId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editedEdu),
      });
      if (res.ok) {
        const updated = await res.json();
        setEducation(updated);
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Failed to save education:", error);
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
      setEditedEdu({ ...editedEdu, logo: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const addFocusArea = () => {
    const area = newFocusArea.trim();
    if (area && !editedEdu.focusAreas?.includes(area)) {
      setEditedEdu({ ...editedEdu, focusAreas: [...(editedEdu.focusAreas || []), area] });
      setNewFocusArea("");
    }
  };

  const removeFocusArea = (areaToRemove: string) => {
    setEditedEdu({
      ...editedEdu,
      focusAreas: editedEdu.focusAreas?.filter((a) => a !== areaToRemove) || [],
    });
  };

  const addAchievement = () => {
    const ach = newAchievement.trim();
    if (ach && !editedEdu.achievements?.includes(ach)) {
      setEditedEdu({ ...editedEdu, achievements: [...(editedEdu.achievements || []), ach] });
      setNewAchievement("");
    }
  };

  const removeAchievement = (achToRemove: string) => {
    setEditedEdu({
      ...editedEdu,
      achievements: editedEdu.achievements?.filter((a) => a !== achToRemove) || [],
    });
  };

  const editWithKronus = () => {
    if (!education) return;
    const context = `I want to UPDATE this education entry in my CV. Please help me modify it using the repository tools.

**Current Education:**
- **ID:** ${education.id}
- **Degree:** ${education.degree}
- **Field:** ${education.field}
- **Institution:** ${education.institution}
- **Location:** ${education.location}
- **Period:** ${education.dateStart} - ${education.dateEnd}
- **Tagline:** ${education.tagline}
${education.note ? `- **Note:** ${education.note}` : ""}
${education.focusAreas?.length ? `- **Focus Areas:** ${education.focusAreas.join(", ")}` : ""}
${education.achievements?.length ? `- **Achievements:** ${education.achievements.slice(0, 2).join("; ")}` : ""}

What would you like to change?`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  };

  // Get logo to display
  const displayLogo = isEditing ? editedEdu.logo : education?.logo;

  if (loading) {
    return (
      <div className="flex h-full flex-col bg-[var(--tartarus-void)] p-6">
        <Skeleton className="mb-4 h-8 w-1/3 bg-[var(--tartarus-elevated)]" />
        <Skeleton className="h-96 w-full bg-[var(--tartarus-elevated)]" />
      </div>
    );
  }

  if (!education) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--tartarus-void)]">
        <p className="text-[var(--tartarus-ivory-muted)]">Education entry not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--tartarus-void)]">
      {/* Header */}
      <header className="flex min-h-14 flex-col gap-2 border-b border-[var(--tartarus-border)] px-3 py-2 md:flex-row md:items-center md:justify-between md:px-6 md:py-0">
        <div className="flex items-center gap-2 md:gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/library?tab=cv")}
            className="text-[var(--tartarus-ivory-muted)] hover:bg-[var(--tartarus-elevated)] hover:text-[var(--tartarus-ivory)]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-lg font-semibold text-[var(--tartarus-ivory)]">{education.degree}</h1>
          <Badge className="bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)]">
            {education.field}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setEditedEdu(education);
                }}
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
                <img
                  src="/chronus-logo.png"
                  alt="Kronus"
                  className="mr-2 h-4 w-4 rounded-full object-cover"
                />
                Edit with Kronus
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl">
          {/* Hero Card */}
          <Card className="mb-6 overflow-hidden border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] shadow-lg">
            {/* Header with gradient */}
            <div className="relative h-40 border-b border-[var(--tartarus-border)] bg-gradient-to-r from-[var(--tartarus-teal-dim)] to-[var(--tartarus-surface)]">
              <div className="absolute right-6 bottom-4 left-6">
                <div className="flex items-end justify-between">
                  <div className="flex items-center gap-4">
                    {/* Logo Container - Clickable when editing */}
                    <div
                      className={`group relative flex h-20 w-20 items-center justify-center rounded-xl border border-[var(--tartarus-border)] bg-[var(--tartarus-elevated)] shadow-lg ${isEditing ? "cursor-pointer" : ""}`}
                      onClick={() => isEditing && fileInputRef.current?.click()}
                    >
                      {displayLogo ? (
                        <img
                          src={displayLogo}
                          alt={education.institution}
                          className="h-14 w-14 object-contain"
                        />
                      ) : (
                        <GraduationCap className="h-10 w-10 text-[var(--tartarus-teal)]" />
                      )}

                      {/* Upload overlay when editing */}
                      {isEditing && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
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
                        <div className="space-y-2">
                          <Input
                            value={editedEdu.degree || ""}
                            onChange={(e) => setEditedEdu({ ...editedEdu, degree: e.target.value })}
                            className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-xl font-bold text-[var(--tartarus-ivory)]"
                            placeholder="Degree"
                          />
                          <Input
                            value={editedEdu.field || ""}
                            onChange={(e) => setEditedEdu({ ...editedEdu, field: e.target.value })}
                            className="h-7 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-sm text-[var(--tartarus-ivory)]"
                            placeholder="Field of Study"
                          />
                        </div>
                      ) : (
                        <>
                          <h2 className="text-2xl font-bold text-[var(--tartarus-ivory)]">
                            {education.degree}
                          </h2>
                          <p className="text-lg text-[var(--tartarus-teal)]">{education.field}</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <CardContent className="pt-6">
              {/* Logo URL (when editing) */}
              {isEditing && (
                <div className="mb-6">
                  <Label className="mb-2 block text-sm font-medium text-[var(--tartarus-ivory-muted)]">
                    Institution Logo URL (or click image above to upload)
                  </Label>
                  <Input
                    value={editedEdu.logo || ""}
                    onChange={(e) => setEditedEdu({ ...editedEdu, logo: e.target.value })}
                    placeholder="https://... or upload above"
                    className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                  />
                </div>
              )}

              {/* Institution & Meta Info */}
              <div className="mb-6 grid grid-cols-1 gap-4 border-b border-[var(--tartarus-border)] pb-6 md:grid-cols-3">
                <div className="md:col-span-1">
                  <Label className="mb-1 block flex items-center gap-1 text-xs text-[var(--tartarus-ivory-muted)]">
                    <BookOpen className="h-3 w-3" /> Institution
                  </Label>
                  {isEditing ? (
                    <Input
                      value={editedEdu.institution || ""}
                      onChange={(e) => setEditedEdu({ ...editedEdu, institution: e.target.value })}
                      className="h-8 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-sm text-[var(--tartarus-ivory)]"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-[var(--tartarus-teal)]">
                      {education.institution}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="mb-1 block flex items-center gap-1 text-xs text-[var(--tartarus-ivory-muted)]">
                    <MapPin className="h-3 w-3" /> Location
                  </Label>
                  {isEditing ? (
                    <Input
                      value={editedEdu.location || ""}
                      onChange={(e) => setEditedEdu({ ...editedEdu, location: e.target.value })}
                      className="h-8 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-sm text-[var(--tartarus-ivory)]"
                    />
                  ) : (
                    <p className="text-sm font-medium text-[var(--tartarus-ivory)]">
                      {education.location}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="mb-1 block flex items-center gap-1 text-xs text-[var(--tartarus-ivory-muted)]">
                    <Calendar className="h-3 w-3" /> Period
                  </Label>
                  {isEditing ? (
                    <div className="flex gap-2">
                      <Input
                        value={editedEdu.dateStart || ""}
                        onChange={(e) => setEditedEdu({ ...editedEdu, dateStart: e.target.value })}
                        placeholder="Start"
                        className="h-8 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-sm text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                      />
                      <Input
                        value={editedEdu.dateEnd || ""}
                        onChange={(e) => setEditedEdu({ ...editedEdu, dateEnd: e.target.value })}
                        placeholder="End"
                        className="h-8 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-sm text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                      />
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-[var(--tartarus-ivory)]">
                      {education.dateStart} - {education.dateEnd}
                    </p>
                  )}
                </div>
              </div>

              {/* Tagline */}
              <div className="mb-6">
                <Label className="mb-2 block text-sm font-medium text-[var(--tartarus-ivory-muted)]">
                  Tagline
                </Label>
                {isEditing ? (
                  <Input
                    value={editedEdu.tagline || ""}
                    onChange={(e) => setEditedEdu({ ...editedEdu, tagline: e.target.value })}
                    className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory)]"
                  />
                ) : (
                  <p className="text-lg text-[var(--tartarus-teal)] italic">
                    "{education.tagline}"
                  </p>
                )}
              </div>

              {/* Note */}
              {(education.note || isEditing) && (
                <div className="mb-6">
                  <Label className="mb-2 block text-sm font-medium text-[var(--tartarus-ivory-muted)]">
                    Note
                  </Label>
                  {isEditing ? (
                    <Textarea
                      value={editedEdu.note || ""}
                      onChange={(e) => setEditedEdu({ ...editedEdu, note: e.target.value })}
                      placeholder="Additional context..."
                      className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                    />
                  ) : education.note ? (
                    <div className="rounded-lg border border-[var(--tartarus-teal-dim)] bg-[var(--tartarus-teal-soft)] p-4">
                      <p className="text-sm text-[var(--tartarus-ivory)]">{education.note}</p>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Focus Areas */}
          {(education.focusAreas?.length > 0 || isEditing) && (
            <Card className="mb-6 border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-[var(--tartarus-ivory)]">
                  <Target className="h-5 w-5 text-[var(--tartarus-teal)]" />
                  Focus Areas
                  <Badge
                    variant="secondary"
                    className="ml-2 bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)]"
                  >
                    {education.focusAreas?.length || 0}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {editedEdu.focusAreas?.map((area, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="bg-[var(--tartarus-teal-soft)] pr-1 text-[var(--tartarus-teal)]"
                        >
                          {area}
                          <button
                            onClick={() => removeFocusArea(area)}
                            className="ml-1 hover:text-[var(--tartarus-error)]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newFocusArea}
                        onChange={(e) => setNewFocusArea(e.target.value)}
                        placeholder="Add focus area..."
                        className="max-w-md border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addFocusArea();
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addFocusArea}
                        className="border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-soft)]"
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {education.focusAreas?.map((area, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-elevated)] p-3"
                      >
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--tartarus-teal-soft)]">
                          <span className="text-xs font-semibold text-[var(--tartarus-teal)]">
                            {i + 1}
                          </span>
                        </div>
                        <p className="text-sm text-[var(--tartarus-ivory)]">{area}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Achievements */}
          {(education.achievements?.length > 0 || isEditing) && (
            <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-[var(--tartarus-ivory)]">
                  <Award className="h-5 w-5 text-[var(--tartarus-gold)]" />
                  Achievements & Honors
                  <Badge
                    variant="secondary"
                    className="ml-2 bg-[var(--tartarus-gold-soft)] text-[var(--tartarus-gold)]"
                  >
                    {education.achievements?.length || 0}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {editedEdu.achievements?.map((ach, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 rounded border border-[var(--tartarus-gold-dim)] bg-[var(--tartarus-gold-soft)] p-2"
                        >
                          <span className="flex-1 text-sm text-[var(--tartarus-ivory)]">{ach}</span>
                          <button
                            onClick={() => removeAchievement(ach)}
                            className="text-[var(--tartarus-ivory-muted)] hover:text-[var(--tartarus-error)]"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Textarea
                        value={newAchievement}
                        onChange={(e) => setNewAchievement(e.target.value)}
                        placeholder="Add achievement..."
                        className="min-h-[60px] max-w-md border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            addAchievement();
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addAchievement}
                        className="self-start border-[var(--tartarus-gold-dim)] text-[var(--tartarus-gold)] hover:bg-[var(--tartarus-gold-soft)]"
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {education.achievements?.map((ach, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg border border-[var(--tartarus-gold-dim)] bg-[var(--tartarus-gold-soft)] p-4"
                      >
                        <Award className="mt-0.5 h-5 w-5 shrink-0 text-[var(--tartarus-gold)]" />
                        <p className="text-sm text-[var(--tartarus-ivory)]">{ach}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
