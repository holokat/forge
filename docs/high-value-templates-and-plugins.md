# High-Value Templates and Plugins

This checklist tracks the first practical wave of Obsidian-like Forge features that help both people and local agents work inside a Markdown vault.

## Wave 1: Ship Now

- [x] Define the high-value template/plugin implementation plan.
- [x] Expand the built-in starter template pack with agent/user templates for daily notes, meeting notes, agent task briefs, SEO/content briefs, research briefs, PRDs, project plans, bug reports, decision records, publish pages, changelog entries, and transcript cleanup.
- [x] Add template variables so templates can ask for values at creation time.
- [x] Expose template variable values through CLI and MCP creation flows.
- [x] Add an Obsidian-like note preview for internal links in reading mode.
- [x] Add note refactor command: extract selected text into a new linked note.
- [x] Update agent-facing docs so Codex, Claude, and other tools can discover templates.
- [x] Add a Forge changelog note for the shipped template/plugin wave.

## Wave 2: Next Best Features

- [x] Backlinks panel improvements: linked mentions, unlinked mentions, and quick link insertion.
- [x] Bookmarks: pin notes and searches for fast workspace navigation.
- [x] Template gallery UI: start a note from template directly from empty states and file creation.
- [x] Slash command or command palette template insertion inside an existing note.
- [x] Canvas/light board for linking notes visually.

## Wave 3: Extension Platform

- [x] Add a runtime contribution catalog for command, markdown transform, metadata, sidebar widget, and view hooks before remote installs.
- [x] Add a safe local extension manifest format for open-source contributors.
- [x] Add local folder extension discovery for open-source contributors.
- [x] Add extension package validation and permissions review groundwork.
- [x] Show local extension contribution counts and registry diagnostics in Settings.
- [x] Show active and wired runtime hook counts in Settings.
- [x] Add signed remote extension registry types and documentation.
- [x] Publish a minimal extension SDK with examples.
- [x] Route every declared built-in hook to visible UI before enabling remote installs.
- [x] Add signed-registry validation and guarded remote registry install UI.
- [x] Add practical local built-ins for backlinks, unresolved links, tag index, outline/table-of-contents, publish checklist, and frontmatter inspection.
- [x] Add registry examples for link health, tag/outline metadata, publish checklists, and frontmatter inspection.

## Wave 4: Agent and Knowledge Work Templates

- [x] Add weekly review, source/literature note, and knowledge map/MOC starter templates.
- [x] Add sprint plan, support ticket, experiment log, content outline, and interview notes starter templates.
- [x] Mirror the new starter templates in the agent-facing catalog so CLI and MCP users can inspect their fields.
- [x] Add callout library/snippets and agent review/QA starter templates.

## Wave 4: Declarative Extension Examples

- [x] Add a local task checklist example with task metadata, the tasks sidebar widget, and the `lines-to-checklist` transform.
- [x] Add a table-of-contents insertion example using current heading metadata and the supported `insert-table-of-contents` transform.
- [x] Add a callout formatting example using the supported `callout` Markdown transform.
- [x] Add a local media attachments example using attachment metadata and the supported media gallery sidebar widget.
- [x] Add a first-class tasks sidebar widget contribution value and a validated `lines-to-checklist` Markdown transform.
- [x] Add a first-class callout formatting transform with callout type/title prompts.
- [x] Add a sort-lines Markdown transform for selected Markdown cleanup.
- [x] Add a first-class generated table-of-contents insertion transform instead of relying on generic template insertion.
- [x] Add callout style presets and reusable callout templates on top of the first-class callout transform.
- [x] Add image, video, PDF, and mixed-media gallery widget contribution values for local attachments.

## Wave 5: Vault Intelligence

- [x] Add a vault-wide Tasks workspace view for open, done, and all Markdown checklist items.
- [x] Make task navigation line-aware so task clicks open the source note at the matching line.
- [x] Harden task parsing to skip fenced code blocks and support ordered checklist syntax.
- [x] Expose the Tasks workspace as a safe declarative `forge.views` contribution.
- [x] Add local extension examples for vault health, metadata dashboards, static publishing workflows, and agent handoff workflows.
- [x] Add incident postmortem, technical RFC, API spec, launch plan, customer profile, content calendar, learning plan, and decision review starter templates.
- [ ] Add saved task filters and recurring task rules.
- [ ] Add a dedicated vault-health workspace view with stale-note, duplicate-title, orphan, and broken-link repair queues.
- [ ] Add a declarative query/dashboard view once the extension validator supports query contribution values.
