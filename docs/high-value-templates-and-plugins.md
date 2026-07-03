# High-Value Templates and Plugins

This checklist tracks the first practical wave of Obsidian-like Forge features that help both people and local agents work inside a Markdown vault.

Verified locally:

- `built-in-templates` currently exposes 44 starter templates.
- `built-in-extensions` currently exposes 13 bundled manifests across 5 extension points, with 31 contributions.
- `examples/extensions` currently contains 23 valid local-folder example manifests.

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
- [x] Bookmarks: pin notes for fast workspace navigation.
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

## Wave 5: Declarative Extension Examples

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
- [x] Add valid workflow scaffolds for meeting/content work, publish prep, saved-query notes, task review, and vault reporting.

## Wave 6: Vault Intelligence Baseline

- [x] Add a vault-wide Tasks workspace view for open, done, and all Markdown checklist items.
- [x] Make task navigation line-aware so task clicks open the source note at the matching line.
- [x] Harden task parsing to skip fenced code blocks and support ordered checklist syntax.
- [x] Expose the Tasks workspace as a safe declarative `forge.views` contribution.
- [x] Add a first-class vault-health workspace view and `forge.views` contribution for broken links, duplicate titles, orphan notes, untagged/empty notes, tasks, and inbox counts.
- [x] Add local extension examples for vault health, metadata dashboards, static publishing workflows, and agent handoff workflows.
- [x] Add incident postmortem, technical RFC, API spec, launch plan, customer profile, content calendar, learning plan, and decision review starter templates.
- [x] Ship static publishing through the CLI, MCP, `forge-publish`, and the Settings generate-site workflow.

## Wave 7: Vault Health and Repair

- [x] Add stale-note detection and explicit repair queues to the vault-health workspace.
- [ ] Add one-click repair actions for common safe fixes: create missing notes, insert wikilinks for unlinked mentions, open broken-link sources, and move orphan notes into review.
- [x] Extend `analyze --json` and `forge_analyze` with stale-note and duplicate-title signals so agents can run the same health checks without the UI.
- [x] Add a vault health audit starter template for agents to summarize findings, proposed repairs, and skipped risky changes.

## Wave 8: Saved Searches and Queries

- [ ] Add saved searches for note search queries, including tag/property filters and bookmark-style navigation.
- [ ] Add saved task filters and recurring task rules.
- [ ] Add a bounded query model for tags, frontmatter, links, tasks, headings, publish fields, and file paths.
- [ ] Add saved dashboard/table views for common queues: open tasks, draft publish pages, broken links, stale notes, and review-needed notes.
- [ ] Add a declarative query/dashboard view only after the extension validator supports non-executable query contribution values.

## Wave 9: Publishing Workflows

- [ ] Add a publish preflight workspace or report covering missing slugs/descriptions, broken links, unresolved assets, draft pages, and checklist state.
- [ ] Add saved publish profiles for site title, output folder, clean behavior, include/exclude rules, and deploy notes.
- [ ] Add publish workflow contribution values only after validator support exists for preflight rules and profile references.
- [ ] Add agent-facing publish preflight and release handoff templates that map cleanly to CLI/MCP publish commands.

## Wave 10: Agent-Facing Templates

- [x] Add Vault Health Report, Task Review, Saved Query, Content Refresh Brief, Extension Spec, and Publish Runbook starter templates.
- [x] Add implementation plan, verification report, refactor plan, vault maintenance, saved query catalog, and publish preflight starter templates.
- [ ] Give each agent template explicit fields for objective, owned files, allowed commands, verification, risks, and final handoff notes.
- [ ] Mirror every new starter template in the UI starter gallery, `built-in-templates --json --content`, `seed-templates`, and MCP/CLI docs.

## Open Notes

- Workflow examples such as `query-dashboard`, `saved-query-scaffold`, `publish-prep`, `static-publishing-workflow`, and `agent-handoff-workflow` are valid declarative scaffolds over supported metadata, widgets, transforms, and views. They are not dedicated workflow engines yet.
- A built-in `vault-health` view now includes stale-note detection, duplicate-title checks, create-missing-note repair actions, and CLI/MCP parity. Broader repair automation and saved health reports are still roadmap work.
- Bookmarks currently persist note paths only. Saved searches and saved query dashboards are still roadmap work.
- The validator currently accepts `graph-insights`, `outline-board`, `tasks`, and `vault-health` view contribution values. Do not encode new values such as saved-query result views, publish pipeline commands, or agent workflow launchers until validation and runtime routing support them.
