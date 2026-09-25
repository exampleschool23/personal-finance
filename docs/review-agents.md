# Project review agents

The project-scoped profiles in `.codex/agents/` inherit the current model, reasoning effort, and permissions. Both follow `AGENTS.md`.

- `design` reviews UX, accessibility, layout, themes, and localized financial UI.
- `qa` reviews correctness and regression coverage, runs project checks, and performs manual browser QA when authorized in the designated test account.

Ask Codex:

> Use the design and qa agents to review this project. Have design review UI and accessibility while qa runs checks and assesses regression coverage. Wait for both and consolidate prioritized findings. Review only; do not fix application code yet.

For a focused review:

> Use the design and qa agents to review my uncommitted changes and affected workflows. Report confirmed issues and missing regression coverage.

For fixes and verification:

> Fix the confirmed findings, add behavioral regression coverage, then have design and qa review the affected workflows again.

The parent assigns concrete scopes, coordinates build ownership, and deduplicates findings. Browser debugging requires user permission. Profiles do not schedule reviews or run automatically.

For manual QA:

> Run manual QA in my test account. Check benchmark saving and reload persistence, mortgage principal and interest, cash deductions, history, validation, and cancellation. Use clearly labeled QA samples and leave existing records untouched. Restore changed preferences and report any samples that cannot be removed.

The QA agent checks whether cleanup is possible before recording linked transactions. Mortgage payments currently cannot be edited or deleted, so completing that scenario requires agreement to retain test history. A manual report distinguishes UI checks actually performed from automated coverage and scenarios still pending.

Agent format: [official Codex subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents).
