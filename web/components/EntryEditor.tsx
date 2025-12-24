"use client";

import { useState } from "react";

interface JournalEntry {
  commit_hash: string;
  why: string;
  what_changed: string;
  decisions: string;
  technologies: string;
  kronus_wisdom: string | null;
}

interface EntryEditorProps {
  entry: JournalEntry;
  onUpdate: (updates: Partial<JournalEntry>) => Promise<void>;
  onCancel: () => void;
}

export default function EntryEditor({ entry, onUpdate, onCancel }: EntryEditorProps) {
  const [formData, setFormData] = useState({
    why: entry.why,
    what_changed: entry.what_changed,
    decisions: entry.decisions,
    technologies: entry.technologies,
    kronus_wisdom: entry.kronus_wisdom || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onUpdate({
        ...formData,
        kronus_wisdom: formData.kronus_wisdom || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="mb-6 text-2xl font-bold text-slate-900">Edit Entry</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="why" className="mb-2 block text-sm font-medium text-slate-700">
            Why
          </label>
          <textarea
            id="why"
            value={formData.why}
            onChange={(e) => setFormData({ ...formData, why: e.target.value })}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label htmlFor="what_changed" className="mb-2 block text-sm font-medium text-slate-700">
            What Changed
          </label>
          <textarea
            id="what_changed"
            value={formData.what_changed}
            onChange={(e) => setFormData({ ...formData, what_changed: e.target.value })}
            rows={6}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label htmlFor="decisions" className="mb-2 block text-sm font-medium text-slate-700">
            Decisions
          </label>
          <textarea
            id="decisions"
            value={formData.decisions}
            onChange={(e) => setFormData({ ...formData, decisions: e.target.value })}
            rows={6}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label htmlFor="technologies" className="mb-2 block text-sm font-medium text-slate-700">
            Technologies
          </label>
          <textarea
            id="technologies"
            value={formData.technologies}
            onChange={(e) => setFormData({ ...formData, technologies: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label htmlFor="kronus_wisdom" className="mb-2 block text-sm font-medium text-slate-700">
            Kronus Wisdom (Optional)
          </label>
          <textarea
            id="kronus_wisdom"
            value={formData.kronus_wisdom}
            onChange={(e) => setFormData({ ...formData, kronus_wisdom: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            placeholder="Optional philosophical reflection..."
          />
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-slate-100 px-6 py-2 text-slate-700 transition-colors hover:bg-slate-200 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}










