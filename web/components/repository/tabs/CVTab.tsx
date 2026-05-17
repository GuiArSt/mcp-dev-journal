"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Briefcase, Calendar, Edit, Tag, Settings, GraduationCap } from "lucide-react";
import {
  SkillEditForm,
  ExperienceEditForm,
  EducationEditForm,
} from "@/components/repository/CVEditForms";
import { SkillIcon } from "@/components/repository/shared";
import type {
  Skill,
  Achievement,
  WorkExperience,
  Education,
  SkillCategory,
} from "@/lib/types/repository";

interface CVTabProps {
  loading: boolean;
  filteredSkills: Skill[];
  skillsByCategory: Record<string, Skill[]>;
  experience: WorkExperience[];
  education: Education[];
  skillCategories: SkillCategory[];
  categoryConfig: Record<
    string,
    { color: string; bgColor: string; barColor: string; icon: React.ReactNode }
  >;
  editingSkill: string | null;
  setEditingSkill: (id: string | null) => void;
  editingExperience: string | null;
  setEditingExperience: (id: string | null) => void;
  editingEducation: string | null;
  setEditingEducation: (id: string | null) => void;
  handleSaveSkill: (data: Partial<Skill>) => Promise<void>;
  handleSaveExperience: (data: Partial<WorkExperience>) => Promise<void>;
  handleSaveEducation: (data: Partial<Education>) => Promise<void>;
  addSkillWithKronus: () => void;
  addExperienceWithKronus: () => void;
  addEducationWithKronus: () => void;
  openCategoryDialog: (category?: SkillCategory) => void;
}

export function CVTab({
  loading,
  filteredSkills,
  skillsByCategory,
  experience,
  education,
  skillCategories,
  categoryConfig,
  editingSkill,
  setEditingSkill,
  editingExperience,
  setEditingExperience,
  editingEducation,
  setEditingEducation,
  handleSaveSkill,
  handleSaveExperience,
  handleSaveEducation,
  addSkillWithKronus,
  addExperienceWithKronus,
  addEducationWithKronus,
  openCategoryDialog,
}: CVTabProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-4 h-8 w-48" />
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-32 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Skills Section - Grouped by Category */}
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Briefcase className="h-5 w-5" />
            Skills
            <Badge variant="secondary" className="ml-2">
              {filteredSkills.length}
            </Badge>
          </h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openCategoryDialog()}
              className="border-[var(--tartarus-teal)] text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal)]/10"
            >
              <Settings className="mr-2 h-4 w-4" />
              New Category
            </Button>
            <Button
              size="sm"
              onClick={addSkillWithKronus}
              className="bg-[var(--tartarus-gold)] font-medium text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold-bright)]"
            >
              <img
                src="/chronus-logo.png"
                alt="Kronus"
                className="mr-2 h-4 w-4 rounded-full object-cover"
              />
              Add with Kronus
            </Button>
          </div>
        </div>

        {Object.entries(skillsByCategory).length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[var(--tartarus-ivory-muted)]">No skills match your filters.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(skillsByCategory).map(([category, categorySkills]) => {
              const config = categoryConfig[category] || {
                color: "text-[var(--tartarus-ivory-muted)]",
                bgColor:
                  "bg-[var(--tartarus-surface)] border-[var(--tartarus-border)]",
                barColor: "bg-[var(--tartarus-teal-dim)]",
                icon: <Tag className="h-4 w-4" />,
              };
              const categoryObj = skillCategories.find((c) => c.name === category);

              return (
                <div key={category}>
                  {/* Category Header */}
                  <div
                    className={`mb-4 flex items-center gap-3 rounded-lg border p-3 ${config.bgColor} group`}
                  >
                    <span className={config.color}>{config.icon}</span>
                    <h3 className={`font-semibold ${config.color}`}>{category}</h3>
                    <Badge variant="outline" className={config.color}>
                      {categorySkills.length} skills
                    </Badge>
                    <div className="flex-1" />
                    {categoryObj && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100 ${config.color}`}
                        onClick={() => openCategoryDialog(categoryObj)}
                        title="Edit category"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Skills Grid */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {categorySkills.map((skill) =>
                      editingSkill === skill.id ? (
                        <SkillEditForm
                          key={skill.id}
                          skill={skill}
                          categories={skillCategories}
                          onSave={handleSaveSkill}
                          onCancel={() => setEditingSkill(null)}
                        />
                      ) : (
                        <Link key={skill.id} href={`/library/skill/${skill.id}`}>
                          <Card
                            className="group relative h-full cursor-pointer overflow-hidden border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-[var(--tartarus-teal-dim)] hover:shadow-[0_0_20px_rgba(0,206,209,0.1)]"
                          >
                            <div className={`h-0.5 ${config.barColor}`} />
                            <CardHeader className="pb-2">
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.bgColor}`}
                                  >
                                    <SkillIcon
                                      skillName={skill.name}
                                      fallbackIcon={config.icon}
                                      fallbackColor={config.color}
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <CardTitle className="line-clamp-1 text-sm font-semibold text-[var(--tartarus-ivory)]">
                                      {skill.name}
                                    </CardTitle>
                                    <div className="mt-0.5 flex items-center gap-0.5">
                                      {Array.from({ length: 5 }).map((_, i) => (
                                        <div
                                          key={i}
                                          className={`h-2 w-3 rounded-sm ${
                                            i < skill.magnitude
                                              ? config.barColor
                                              : "bg-[var(--tartarus-border)] border border-[var(--tartarus-border)]"
                                          }`}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 shrink-0 p-0 text-[var(--tartarus-teal)] opacity-0 hover:text-[var(--tartarus-teal-bright)] group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setEditingSkill(skill.id);
                                  }}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <p className="text-[var(--tartarus-ivory-muted)] line-clamp-2 text-xs leading-relaxed">
                                {skill.description}
                              </p>
                            </CardContent>
                          </Card>
                        </Link>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Work Experience Section - Timeline Style */}
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[var(--tartarus-ivory)]">
            <Briefcase className="h-5 w-5 text-[var(--tartarus-gold)]" />
            Work Experience
            <Badge variant="secondary" className="ml-2">
              {experience.length}
            </Badge>
          </h2>
          <Button
            size="sm"
            onClick={addExperienceWithKronus}
            className="bg-[var(--tartarus-gold)] font-medium text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold-bright)]"
          >
            <img
              src="/chronus-logo.png"
              alt="Kronus"
              className="mr-2 h-4 w-4 rounded-full object-cover"
            />
            Add with Kronus
          </Button>
        </div>

        <div className="relative">
          {/* Timeline line */}
          <div className="absolute top-0 bottom-0 left-4 w-0.5 bg-gradient-to-b from-[var(--tartarus-gold)] via-[var(--tartarus-gold)]/50 to-transparent" />

          <div className="space-y-6">
            {experience.map((exp) =>
              editingExperience === exp.id ? (
                <div key={exp.id} className="ml-10">
                  <ExperienceEditForm
                    experience={exp}
                    onSave={handleSaveExperience}
                    onCancel={() => setEditingExperience(null)}
                  />
                </div>
              ) : (
                <div key={exp.id} className="relative flex gap-4">
                  {/* Timeline dot */}
                  <div
                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                      !exp.dateEnd
                        ? "border-[var(--tartarus-gold)] bg-[var(--tartarus-gold)]/20"
                        : "border-[var(--tartarus-gold-dim)] bg-[var(--tartarus-surface)]"
                    }`}
                  >
                    <Briefcase
                      className={`h-4 w-4 ${
                        !exp.dateEnd ? "text-[var(--tartarus-gold)]" : "text-[var(--tartarus-gold-dim)]"
                      }`}
                    />
                  </div>

                  {/* Experience Card */}
                  <Link href={`/library/experience/${exp.id}`} className="flex-1">
                    <Card
                      className="group relative cursor-pointer overflow-hidden border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-[var(--tartarus-teal-dim)] hover:shadow-[0_0_20px_rgba(0,206,209,0.1)]"
                    >
                      <div className="h-0.5 bg-gradient-to-r from-[var(--tartarus-gold)] to-[var(--tartarus-teal)]" />
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <CardTitle className="text-base font-semibold text-[var(--tartarus-ivory)]">
                                {exp.title}
                              </CardTitle>
                              {!exp.dateEnd && (
                                <Badge className="bg-[var(--tartarus-gold)] text-xs text-[var(--tartarus-void)]">
                                  Current
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium text-[var(--tartarus-gold)]">
                              {exp.company}
                            </p>
                            <div className="mt-2 flex items-center gap-3 text-xs text-[var(--tartarus-ivory-faded)]">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {exp.dateStart} - {exp.dateEnd || "Present"}
                              </span>
                              <span className="flex items-center gap-1">•</span>
                              <span>{exp.location}</span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-[var(--tartarus-teal)] opacity-0 hover:text-[var(--tartarus-teal-bright)] group-hover:opacity-100"
                            onClick={(e) => {
                              e.preventDefault();
                              setEditingExperience(exp.id);
                            }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        {exp.tagline && (
                          <p className="text-sm italic text-[var(--tartarus-ivory-muted)]">
                            {exp.tagline}
                          </p>
                        )}
                        {exp.department && (
                          <p className="text-xs text-[var(--tartarus-ivory-muted)]">
                            <span className="font-medium">Department:</span>{" "}
                            {exp.department}
                          </p>
                        )}
                        {exp.note && (
                          <p className="rounded border border-[var(--tartarus-border)] bg-[var(--tartarus-void)]/50 p-2 text-xs text-[var(--tartarus-ivory-muted)]">
                            {exp.note}
                          </p>
                        )}
                        {exp.achievements && exp.achievements.length > 0 && (
                          <div className="border-t border-[var(--tartarus-border)] pt-2">
                            <p className="mb-2 text-xs font-medium text-[var(--tartarus-gold)]">
                              Key Achievements ({exp.achievements.length})
                            </p>
                            <div className="space-y-2">
                              {Object.entries(
                                exp.achievements.reduce(
                                  (acc, ach) => {
                                    const cat = ach.category || "General";
                                    if (!acc[cat]) acc[cat] = [];
                                    acc[cat].push(ach);
                                    return acc;
                                  },
                                  {} as Record<string, Achievement[]>
                                )
                              )
                                .slice(0, 3)
                                .map(([category, achievements]) => (
                                  <div key={category}>
                                    <p className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--tartarus-gold-dim)] uppercase">
                                      {category}
                                    </p>
                                    <ul className="space-y-1">
                                      {achievements.slice(0, 2).map((ach, i) => (
                                        <li
                                          key={i}
                                          className="flex gap-2 text-xs text-[var(--tartarus-ivory-muted)]"
                                        >
                                          <span className="shrink-0 text-[var(--tartarus-gold-dim)]">
                                            •
                                          </span>
                                          <span>
                                            {ach.description}
                                            {ach.metrics && (
                                              <Badge
                                                variant="outline"
                                                className="ml-2 border-[var(--tartarus-gold-dim)] px-1 py-0 text-[9px] text-[var(--tartarus-gold)]"
                                              >
                                                {ach.metrics}
                                              </Badge>
                                            )}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              {exp.achievements.length > 6 && (
                                <p className="text-[10px] text-[var(--tartarus-ivory-faded)]">
                                  +{exp.achievements.length - 6} more achievements...
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Education Section - Card Grid Style */}
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[var(--tartarus-ivory)]">
            <GraduationCap className="h-5 w-5 text-[var(--tartarus-teal)]" />
            Education
            <Badge variant="secondary" className="ml-2">
              {education.length}
            </Badge>
          </h2>
          <Button
            size="sm"
            onClick={addEducationWithKronus}
            className="bg-[var(--tartarus-gold)] font-medium text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold-bright)]"
          >
            <img
              src="/chronus-logo.png"
              alt="Kronus"
              className="mr-2 h-4 w-4 rounded-full object-cover"
            />
            Add with Kronus
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {education.map((edu) =>
            editingEducation === edu.id ? (
              <EducationEditForm
                key={edu.id}
                education={edu}
                onSave={handleSaveEducation}
                onCancel={() => setEditingEducation(null)}
              />
            ) : (
              <Link key={edu.id} href={`/library/education/${edu.id}`}>
                <Card className="group relative h-full cursor-pointer overflow-hidden border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-[var(--tartarus-teal-dim)] hover:shadow-[0_0_20px_rgba(0,206,209,0.1)]">
                  <div className="h-0.5 bg-gradient-to-r from-[var(--tartarus-gold)] to-[var(--tartarus-teal)]" />

                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="mb-2 flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tartarus-teal)]/10">
                            <GraduationCap className="h-5 w-5 text-[var(--tartarus-teal)]" />
                          </div>
                          <div>
                            <CardTitle className="text-base font-semibold text-[var(--tartarus-ivory)]">
                              {edu.degree}
                            </CardTitle>
                            <p className="text-sm font-medium text-[var(--tartarus-teal)]">
                              {edu.field}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-[var(--tartarus-teal)] opacity-0 hover:text-[var(--tartarus-teal-bright)] group-hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault();
                          setEditingEducation(edu.id);
                        }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm font-medium text-[var(--tartarus-ivory)]">{edu.institution}</p>
                    <div className="flex items-center gap-2 text-xs text-[var(--tartarus-ivory-faded)]">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {edu.dateStart} - {edu.dateEnd}
                      </span>
                      <span>•</span>
                      <span>{edu.location}</span>
                    </div>
                    {edu.tagline && (
                      <p className="border-t border-[var(--tartarus-border)] pt-2 text-xs italic text-[var(--tartarus-ivory-muted)]">
                        {edu.tagline}
                      </p>
                    )}
                    {edu.note && (
                      <p className="rounded border border-[var(--tartarus-border)] bg-[var(--tartarus-void)]/50 p-2 text-xs text-[var(--tartarus-ivory-muted)]">
                        {edu.note}
                      </p>
                    )}
                    {edu.focusAreas && edu.focusAreas.length > 0 && (
                      <div className="border-t border-[var(--tartarus-border)] pt-2">
                        <p className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--tartarus-teal)] uppercase">
                          Focus Areas
                        </p>
                        <ul className="space-y-0.5">
                          {edu.focusAreas.slice(0, 3).map((area, i) => (
                            <li
                              key={i}
                              className="flex gap-2 text-xs text-[var(--tartarus-ivory-muted)]"
                            >
                              <span className="shrink-0 text-[var(--tartarus-teal-dim)]">•</span>
                              <span className="line-clamp-1">{area}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {edu.achievements && edu.achievements.length > 0 && (
                      <div className="border-t border-[var(--tartarus-border)] pt-2">
                        <p className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--tartarus-teal)] uppercase">
                          Achievements
                        </p>
                        <ul className="space-y-0.5">
                          {edu.achievements.slice(0, 2).map((ach, i) => (
                            <li
                              key={i}
                              className="flex gap-2 text-xs text-[var(--tartarus-ivory-muted)]"
                            >
                              <span className="shrink-0 text-[var(--tartarus-teal-dim)]">•</span>
                              <span className="line-clamp-2">{ach}</span>
                            </li>
                          ))}
                          {edu.achievements.length > 2 && (
                            <li className="pl-4 text-[10px] text-[var(--tartarus-ivory-faded)]">
                              +{edu.achievements.length - 2} more...
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          )}
        </div>
      </div>
    </div>
  );
}
