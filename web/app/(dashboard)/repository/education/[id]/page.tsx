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
import { ArrowLeft, Edit, Save, X, GraduationCap, MapPin, Calendar, BookOpen, Award, Plus, Target, Upload } from "lucide-react";

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
    setEditedEdu({ ...editedEdu, focusAreas: editedEdu.focusAreas?.filter(a => a !== areaToRemove) || [] });
  };

  const addAchievement = () => {
    const ach = newAchievement.trim();
    if (ach && !editedEdu.achievements?.includes(ach)) {
      setEditedEdu({ ...editedEdu, achievements: [...(editedEdu.achievements || []), ach] });
      setNewAchievement("");
    }
  };

  const removeAchievement = (achToRemove: string) => {
    setEditedEdu({ ...editedEdu, achievements: editedEdu.achievements?.filter(a => a !== achToRemove) || [] });
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
      <div className="flex h-full flex-col p-6 bg-[var(--tartarus-void)]">
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
                onClick={() => { setIsEditing(false); setEditedEdu(education); }}
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
            <div className="h-40 bg-gradient-to-r from-[var(--tartarus-teal-dim)] to-[var(--tartarus-surface)] relative border-b border-[var(--tartarus-border)]">
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
                          alt={education.institution}
                          className="h-14 w-14 object-contain"
                        />
                      ) : (
                        <GraduationCap className="h-10 w-10 text-[var(--tartarus-teal)]" />
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
                        <div className="space-y-2">
                          <Input
                            value={editedEdu.degree || ""}
                            onChange={(e) => setEditedEdu({ ...editedEdu, degree: e.target.value })}
                            className="text-xl font-bold bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]"
                            placeholder="Degree"
                          />
                          <Input
                            value={editedEdu.field || ""}
                            onChange={(e) => setEditedEdu({ ...editedEdu, field: e.target.value })}
                            className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] h-7 text-sm"
                            placeholder="Field of Study"
                          />
                        </div>
                      ) : (
                        <>
                          <h2 className="text-2xl font-bold text-[var(--tartarus-ivory)]">{education.degree}</h2>
                          <p className="text-[var(--tartarus-teal)] text-lg">{education.field}</p>
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
                  <Label className="text-sm font-medium text-[var(--tartarus-ivory-muted)] mb-2 block">
                    Institution Logo URL (or click image above to upload)
                  </Label>
                  <Input
                    value={editedEdu.logo || ""}
                    onChange={(e) => setEditedEdu({ ...editedEdu, logo: e.target.value })}
                    placeholder="https://... or upload above"
                    className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                  />
                </div>
              )}

              {/* Institution & Meta Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 pb-6 border-b border-[var(--tartarus-border)]">
                <div className="md:col-span-1">
                  <Label className="text-xs text-[var(--tartarus-ivory-muted)] mb-1 block flex items-center gap-1">
                    <BookOpen className="h-3 w-3" /> Institution
                  </Label>
                  {isEditing ? (
                    <Input
                      value={editedEdu.institution || ""}
                      onChange={(e) => setEditedEdu({ ...editedEdu, institution: e.target.value })}
                      className="h-8 text-sm bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-[var(--tartarus-teal)]">{education.institution}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-[var(--tartarus-ivory-muted)] mb-1 block flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Location
                  </Label>
                  {isEditing ? (
                    <Input
                      value={editedEdu.location || ""}
                      onChange={(e) => setEditedEdu({ ...editedEdu, location: e.target.value })}
                      className="h-8 text-sm bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]"
                    />
                  ) : (
                    <p className="text-sm font-medium text-[var(--tartarus-ivory)]">{education.location}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-[var(--tartarus-ivory-muted)] mb-1 block flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Period
                  </Label>
                  {isEditing ? (
                    <div className="flex gap-2">
                      <Input
                        value={editedEdu.dateStart || ""}
                        onChange={(e) => setEditedEdu({ ...editedEdu, dateStart: e.target.value })}
                        placeholder="Start"
                        className="h-8 text-sm bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                      />
                      <Input
                        value={editedEdu.dateEnd || ""}
                        onChange={(e) => setEditedEdu({ ...editedEdu, dateEnd: e.target.value })}
                        placeholder="End"
                        className="h-8 text-sm bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                      />
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-[var(--tartarus-ivory)]">{education.dateStart} - {education.dateEnd}</p>
                  )}
                </div>
              </div>

              {/* Tagline */}
              <div className="mb-6">
                <Label className="text-sm font-medium text-[var(--tartarus-ivory-muted)] mb-2 block">Tagline</Label>
                {isEditing ? (
                  <Input
                    value={editedEdu.tagline || ""}
                    onChange={(e) => setEditedEdu({ ...editedEdu, tagline: e.target.value })}
                    className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]"
                  />
                ) : (
                  <p className="text-lg italic text-[var(--tartarus-teal)]">
                    "{education.tagline}"
                  </p>
                )}
              </div>

              {/* Note */}
              {(education.note || isEditing) && (
                <div className="mb-6">
                  <Label className="text-sm font-medium text-[var(--tartarus-ivory-muted)] mb-2 block">Note</Label>
                  {isEditing ? (
                    <Textarea
                      value={editedEdu.note || ""}
                      onChange={(e) => setEditedEdu({ ...editedEdu, note: e.target.value })}
                      placeholder="Additional context..."
                      className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                    />
                  ) : education.note ? (
                    <div className="p-4 rounded-lg border bg-[var(--tartarus-teal-soft)] border-[var(--tartarus-teal-dim)]">
                      <p className="text-sm text-[var(--tartarus-ivory)]">{education.note}</p>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Focus Areas */}
          {(education.focusAreas?.length > 0 || isEditing) && (
            <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] shadow-sm mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-[var(--tartarus-ivory)]">
                  <Target className="h-5 w-5 text-[var(--tartarus-teal)]" />
                  Focus Areas
                  <Badge variant="secondary" className="ml-2 bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)]">
                    {education.focusAreas?.length || 0}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {editedEdu.focusAreas?.map((area, i) => (
                        <Badge key={i} variant="secondary" className="bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)] pr-1">
                          {area}
                          <button onClick={() => removeFocusArea(area)} className="ml-1 hover:text-[var(--tartarus-error)]">
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
                        className="max-w-md bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFocusArea(); } }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addFocusArea}
                        className="border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-soft)]"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {education.focusAreas?.map((area, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[var(--tartarus-elevated)] border border-[var(--tartarus-border)]">
                        <div className="h-6 w-6 rounded-full bg-[var(--tartarus-teal-soft)] flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-xs font-semibold text-[var(--tartarus-teal)]">{i + 1}</span>
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
                  <Badge variant="secondary" className="ml-2 bg-[var(--tartarus-gold-soft)] text-[var(--tartarus-gold)]">
                    {education.achievements?.length || 0}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {editedEdu.achievements?.map((ach, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded bg-[var(--tartarus-gold-soft)] border border-[var(--tartarus-gold-dim)]">
                          <span className="flex-1 text-sm text-[var(--tartarus-ivory)]">{ach}</span>
                          <button onClick={() => removeAchievement(ach)} className="text-[var(--tartarus-ivory-muted)] hover:text-[var(--tartarus-error)]">
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
                        className="max-w-md min-h-[60px] bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addAchievement(); } }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addAchievement}
                        className="self-start border-[var(--tartarus-gold-dim)] text-[var(--tartarus-gold)] hover:bg-[var(--tartarus-gold-soft)]"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {education.achievements?.map((ach, i) => (
                      <div key={i} className="flex items-start gap-3 p-4 rounded-lg bg-[var(--tartarus-gold-soft)] border border-[var(--tartarus-gold-dim)]">
                        <Award className="h-5 w-5 text-[var(--tartarus-gold)] shrink-0 mt-0.5" />
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
