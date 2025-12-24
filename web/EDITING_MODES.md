# Entry Editing Modes

The web app supports two modes for editing journal entries:

## 1. Direct Editing Mode

**What it does**: Directly edits the entry fields in the database.

**When to use**: 
- Quick corrections (typos, formatting)
- Manual refinement of specific sections
- When you know exactly what changes to make

**How it works**:
1. Click **Edit** button on an entry
2. Modify fields directly in the form
3. Click **Save Changes**
4. Database is updated immediately

## 2. Kronus AI Regeneration Mode

**What it does**: Uses Kronus AI to regenerate or refine entries based on new context or instructions.

**When to use**:
- Want to improve entry quality
- Have new context to add
- Need Kronus to refine analysis
- Want to regenerate based on updated agent report

**How it works**:
1. Click **Kronus** button on an entry
2. Optionally provide new context or instructions
3. Choose one of two options:
   - **Regenerate Entry**: Re-analyzes the original `raw_agent_report`
   - **Edit with Context**: Uses your new context + existing entry to generate improvements
4. Review Kronus's suggestions
5. Click **Apply Changes** to update the database

**Key Difference**: Kronus generates new content using AI analysis, while Direct Edit modifies fields manually.

## Which Should You Use?

- **Direct Edit**: For precise, manual changes
- **Kronus**: For AI-powered improvements and refinements

Both modes update the same database fields (`why`, `what_changed`, `decisions`, `technologies`, `kronus_wisdom`).
















