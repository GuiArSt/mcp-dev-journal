"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Edit, Save, X, Plus, Trash2 } from "lucide-react";

interface Skill {
  id: string;
  name: string;
  category: string;
  magnitude: number;
  description: string;
  tags: string[];
}

interface SkillCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
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
  achievements: any[];
}

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
}

export function SkillEditForm({ skill, onSave, onCancel, categories = [] }: { skill: Skill; onSave: (data: Partial<Skill>) => void; onCancel: () => void; categories?: SkillCategory[] }) {
  const [formData, setFormData] = useState(skill);
  const [newTag, setNewTag] = useState("");

  const handleSave = () => {
    onSave(formData);
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: [...formData.tags, tag] });
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tagToRemove) });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <Card className="shadow-lg border-[#E5E0D8]">
      <CardHeader className="border-b border-[#E5E0D8] pb-4 bg-[#FAF8F2]">
        <CardTitle className="flex items-center justify-between text-lg">
          <span className="font-semibold text-[#2A2520]">Edit Skill: {skill.name}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} className="gap-2 border-[#D5D0C8] text-[#5C5550] hover:bg-[#F5F3F0] hover:text-[#2A2520]">
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} className="gap-2">
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-[#2A2520]">Name</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="h-10 border-[#E5E0D8]"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium text-[#2A2520]">Category</Label>
          {categories.length > 0 ? (
            <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
              <SelectTrigger className="h-10 border-[#E5E0D8]">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent className="z-[100] bg-white border-[#E5E0D8]">
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.name}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="h-10 border-[#E5E0D8]"
            />
          )}
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium text-[#2A2520]">Magnitude (1-4)</Label>
          <Select value={String(formData.magnitude)} onValueChange={(v) => setFormData({ ...formData, magnitude: parseInt(v) })}>
            <SelectTrigger className="h-10 border-[#E5E0D8]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[100] bg-white border-[#E5E0D8]">
              <SelectItem value="1">1 - Beginner</SelectItem>
              <SelectItem value="2">2 - Apprentice</SelectItem>
              <SelectItem value="3">3 - Professional</SelectItem>
              <SelectItem value="4">4 - Expert</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium text-[#2A2520]">Description</Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={4}
            className="resize-none border-[#E5E0D8]"
            spellCheck="false"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium text-[#2A2520]">Tags</Label>
          <div className="flex flex-wrap gap-2 mb-2 min-h-[36px] p-2 border border-[#E5E0D8] rounded-md bg-[#FAF8F2]">
            {formData.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="gap-1 bg-[#00A0A4]/10 text-[#007A7D] border border-[#00A0A4]/30 hover:bg-[#00A0A4]/20"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 hover:text-red-600 focus:outline-none"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {formData.tags.length === 0 && (
              <span className="text-sm text-[#A0998A]">No tags</span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleTagKeyDown}
              className="h-9 flex-1 border-[#E5E0D8]"
              placeholder="Add a tag..."
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTag}
              disabled={!newTag.trim()}
              className="h-9 border-[#D5D0C8] text-[#5C5550] hover:bg-[#F5F3F0] hover:text-[#2A2520] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ExperienceEditForm({ experience, onSave, onCancel }: { experience: WorkExperience; onSave: (data: Partial<WorkExperience>) => void; onCancel: () => void }) {
  const [formData, setFormData] = useState(experience);

  const handleSave = () => {
    onSave(formData);
  };

  const addAchievement = () => {
    setFormData({
      ...formData,
      achievements: [...formData.achievements, { category: "", description: "", tags: [] }],
    });
  };

  const removeAchievement = (index: number) => {
    setFormData({
      ...formData,
      achievements: formData.achievements.filter((_, i) => i !== index),
    });
  };

  return (
    <Card className="border-[#E5E0D8]">
      <CardHeader className="border-b border-[#E5E0D8] pb-4 bg-[#FAF8F2]">
        <CardTitle className="flex items-center justify-between text-lg">
          <span className="font-semibold text-[#2A2520]">Edit Experience: {experience.title}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} className="gap-2 border-[#D5D0C8] text-[#5C5550] hover:bg-[#F5F3F0] hover:text-[#2A2520]">
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} className="gap-2">
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Title</Label>
            <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="h-10" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Company</Label>
            <Input value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} className="h-10" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Location</Label>
            <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="h-10" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Department</Label>
            <Input value={formData.department || ""} onChange={(e) => setFormData({ ...formData, department: e.target.value })} className="h-10" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Start Date (YYYY-MM)</Label>
            <Input value={formData.dateStart} onChange={(e) => setFormData({ ...formData, dateStart: e.target.value })} className="h-10" placeholder="2023-08" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">End Date (YYYY-MM or leave empty)</Label>
            <Input value={formData.dateEnd || ""} onChange={(e) => setFormData({ ...formData, dateEnd: e.target.value || null })} className="h-10" placeholder="2025-04 or leave empty" />
          </div>
        </div>
        <div>
          <Label className="text-sm font-medium">Tagline</Label>
          <Input value={formData.tagline} onChange={(e) => setFormData({ ...formData, tagline: e.target.value })} className="h-10" />
        </div>
        <div>
          <Label className="text-sm font-medium">Note</Label>
          <Textarea value={formData.note || ""} onChange={(e) => setFormData({ ...formData, note: e.target.value })} rows={2} className="resize-none" spellCheck="false" />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-sm font-medium">Achievements</Label>
            <Button variant="outline" size="sm" onClick={addAchievement}>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {formData.achievements.map((ach, idx) => (
              <div key={idx} className="flex gap-2 rounded border p-2">
                <Textarea
                  value={typeof ach === "string" ? ach : ach.description || ""}
                  onChange={(e) => {
                    const newAchievements = [...formData.achievements];
                    newAchievements[idx] = typeof ach === "string" ? e.target.value : { ...ach, description: e.target.value };
                    setFormData({ ...formData, achievements: newAchievements });
                  }}
                  rows={2}
                  className="flex-1 resize-none" spellCheck="false"
                />
                <Button variant="ghost" size="sm" onClick={() => removeAchievement(idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Portfolio Project interface
interface PortfolioProject {
  id: string;
  title: string;
  category: string;
  company?: string | null;
  dateCompleted?: string | null;
  status: "shipped" | "wip" | "archived";
  featured: boolean;
  image?: string | null;
  excerpt?: string | null;
  description?: string | null;
  role?: string | null;
  technologies: string[];
  metrics: Record<string, string>;
  links: Record<string, string>;
  tags: string[];
  sortOrder?: number;
}

export function PortfolioProjectEditForm({
  project,
  onSave,
  onCancel
}: {
  project: PortfolioProject;
  onSave: (data: Partial<PortfolioProject>) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState(project);
  const [newTech, setNewTech] = useState("");
  const [newTag, setNewTag] = useState("");

  const handleSave = () => {
    onSave(formData);
  };

  const addTech = () => {
    const tech = newTech.trim();
    if (tech && !formData.technologies.includes(tech)) {
      setFormData({ ...formData, technologies: [...formData.technologies, tech] });
      setNewTech("");
    }
  };

  const removeTech = (techToRemove: string) => {
    setFormData({ ...formData, technologies: formData.technologies.filter(t => t !== techToRemove) });
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: [...formData.tags, tag] });
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tagToRemove) });
  };

  const handleKeyDown = (e: React.KeyboardEvent, addFn: () => void) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addFn();
    }
  };

  return (
    <Card className="shadow-lg border-[#E5E0D8]">
      <CardHeader className="border-b border-[#E5E0D8] pb-4 bg-[#FAF8F2]">
        <CardTitle className="flex items-center justify-between text-lg">
          <span className="font-semibold text-[#2A2520]">Edit Project: {project.title}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} className="gap-2 border-[#D5D0C8] text-[#5C5550] hover:bg-[#F5F3F0] hover:text-[#2A2520]">
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} className="gap-2">
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#2A2520]">Title</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="h-10 border-[#E5E0D8]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#2A2520]">Category</Label>
            <Input
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="h-10 border-[#E5E0D8]"
              placeholder="e.g., Web App, Mobile App, AI/ML"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#2A2520]">Company</Label>
            <Input
              value={formData.company || ""}
              onChange={(e) => setFormData({ ...formData, company: e.target.value || null })}
              className="h-10 border-[#E5E0D8]"
              placeholder="Company name or leave empty for personal"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#2A2520]">Role</Label>
            <Input
              value={formData.role || ""}
              onChange={(e) => setFormData({ ...formData, role: e.target.value || null })}
              className="h-10 border-[#E5E0D8]"
              placeholder="e.g., Lead Developer, Architect"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#2A2520]">Status</Label>
            <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as "shipped" | "wip" | "archived" })}>
              <SelectTrigger className="h-10 border-[#E5E0D8]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[100] bg-white border-[#E5E0D8]">
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="wip">Work in Progress</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#2A2520]">Date Completed</Label>
            <Input
              value={formData.dateCompleted || ""}
              onChange={(e) => setFormData({ ...formData, dateCompleted: e.target.value || null })}
              className="h-10 border-[#E5E0D8]"
              placeholder="YYYY-MM"
            />
          </div>
          <div className="space-y-2 flex items-end">
            <label className="flex items-center gap-2 h-10 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.featured}
                onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                className="w-4 h-4 rounded border-[#E5E0D8]"
              />
              <span className="text-sm font-medium text-[#2A2520]">Featured</span>
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-[#2A2520]">Excerpt (short description)</Label>
          <Textarea
            value={formData.excerpt || ""}
            onChange={(e) => setFormData({ ...formData, excerpt: e.target.value || null })}
            rows={2}
            className="resize-none border-[#E5E0D8]"
            placeholder="Brief one-liner about the project"
            spellCheck="false"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-[#2A2520]">Full Description</Label>
          <Textarea
            value={formData.description || ""}
            onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
            rows={4}
            className="resize-none border-[#E5E0D8]"
            placeholder="Detailed description of the project, challenges, and outcomes"
            spellCheck="false"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-[#2A2520]">Technologies</Label>
          <div className="flex flex-wrap gap-2 mb-2 min-h-[36px] p-2 border border-[#E5E0D8] rounded-md bg-[#FAF8F2]">
            {formData.technologies.map((tech) => (
              <Badge
                key={tech}
                variant="secondary"
                className="gap-1 bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200"
              >
                {tech}
                <button
                  type="button"
                  onClick={() => removeTech(tech)}
                  className="ml-1 hover:text-red-600 focus:outline-none"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {formData.technologies.length === 0 && (
              <span className="text-sm text-[#A0998A]">No technologies</span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTech}
              onChange={(e) => setNewTech(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, addTech)}
              className="h-9 flex-1 border-[#E5E0D8]"
              placeholder="Add a technology..."
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTech}
              disabled={!newTech.trim()}
              className="h-9 border-[#D5D0C8] text-[#5C5550] hover:bg-[#F5F3F0] hover:text-[#2A2520] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-[#2A2520]">Tags</Label>
          <div className="flex flex-wrap gap-2 mb-2 min-h-[36px] p-2 border border-[#E5E0D8] rounded-md bg-[#FAF8F2]">
            {formData.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="gap-1 bg-[#00A0A4]/10 text-[#007A7D] border border-[#00A0A4]/30 hover:bg-[#00A0A4]/20"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 hover:text-red-600 focus:outline-none"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {formData.tags.length === 0 && (
              <span className="text-sm text-[#A0998A]">No tags</span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, addTag)}
              className="h-9 flex-1 border-[#E5E0D8]"
              placeholder="Add a tag..."
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTag}
              disabled={!newTag.trim()}
              className="h-9 border-[#D5D0C8] text-[#5C5550] hover:bg-[#F5F3F0] hover:text-[#2A2520] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-[#2A2520]">Image URL</Label>
          <Input
            value={formData.image || ""}
            onChange={(e) => setFormData({ ...formData, image: e.target.value || null })}
            className="h-10 border-[#E5E0D8]"
            placeholder="https://..."
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function EducationEditForm({ education, onSave, onCancel }: { education: Education; onSave: (data: Partial<Education>) => void; onCancel: () => void }) {
  const [formData, setFormData] = useState(education);

  const handleSave = () => {
    onSave(formData);
  };

  const addFocusArea = () => {
    setFormData({
      ...formData,
      focusAreas: [...formData.focusAreas, ""],
    });
  };

  const removeFocusArea = (index: number) => {
    setFormData({
      ...formData,
      focusAreas: formData.focusAreas.filter((_, i) => i !== index),
    });
  };

  const addAchievement = () => {
    setFormData({
      ...formData,
      achievements: [...formData.achievements, ""],
    });
  };

  const removeAchievement = (index: number) => {
    setFormData({
      ...formData,
      achievements: formData.achievements.filter((_, i) => i !== index),
    });
  };

  return (
    <Card className="border-[#E5E0D8]">
      <CardHeader className="border-b border-[#E5E0D8] pb-4 bg-[#FAF8F2]">
        <CardTitle className="flex items-center justify-between text-lg">
          <span className="font-semibold text-[#2A2520]">Edit Education: {education.degree}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} className="gap-2 border-[#D5D0C8] text-[#5C5550] hover:bg-[#F5F3F0] hover:text-[#2A2520]">
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} className="gap-2">
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Degree</Label>
            <Input value={formData.degree} onChange={(e) => setFormData({ ...formData, degree: e.target.value })} className="h-10" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Field</Label>
            <Input value={formData.field} onChange={(e) => setFormData({ ...formData, field: e.target.value })} className="h-10" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Institution</Label>
            <Input value={formData.institution} onChange={(e) => setFormData({ ...formData, institution: e.target.value })} className="h-10" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Location</Label>
            <Input value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="h-10" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Start Date (YYYY-MM)</Label>
            <Input value={formData.dateStart} onChange={(e) => setFormData({ ...formData, dateStart: e.target.value })} className="h-10" placeholder="2023-08" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">End Date (YYYY-MM)</Label>
            <Input value={formData.dateEnd} onChange={(e) => setFormData({ ...formData, dateEnd: e.target.value })} className="h-10" placeholder="2023-02" />
          </div>
        </div>
        <div>
          <Label className="text-sm font-medium">Tagline</Label>
          <Input value={formData.tagline} onChange={(e) => setFormData({ ...formData, tagline: e.target.value })} className="h-10" />
        </div>
        <div>
          <Label className="text-sm font-medium">Note</Label>
          <Textarea value={formData.note || ""} onChange={(e) => setFormData({ ...formData, note: e.target.value })} rows={2} className="resize-none" spellCheck="false" />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-sm font-medium">Focus Areas</Label>
            <Button variant="outline" size="sm" onClick={addFocusArea}>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {formData.focusAreas.map((area, idx) => (
              <div key={idx} className="flex gap-2">
                <Input 
                  value={area} 
                  onChange={(e) => {
                    const newAreas = [...formData.focusAreas];
                    newAreas[idx] = e.target.value;
                    setFormData({ ...formData, focusAreas: newAreas });
                  }} 
                  className="h-10"
                />
                <Button variant="ghost" size="sm" onClick={() => removeFocusArea(idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-sm font-medium">Achievements</Label>
            <Button variant="outline" size="sm" onClick={addAchievement}>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {formData.achievements.map((ach, idx) => (
              <div key={idx} className="flex gap-2">
                <Input 
                  value={ach} 
                  onChange={(e) => {
                    const newAchievements = [...formData.achievements];
                    newAchievements[idx] = e.target.value;
                    setFormData({ ...formData, achievements: newAchievements });
                  }} 
                  className="h-10"
                />
                <Button variant="ghost" size="sm" onClick={() => removeAchievement(idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
