---
name: quarto-course-pages
description: Create, revise, or review Quarto pages for the industrial robotics and PLC course, including didactic and technical review, cross-references, media, rendering, and preview refresh.
---

# Quarto Course Pages

Use this workflow for substantial work on the course's `.qmd` pages. Keep narrow
wording changes narrow; do not invoke a full review when the user asks for one
small, unambiguous edit.

## Course Context

Write for industry participants taking a further-education course in Norway.
Explain the theory needed to understand and apply industrial robotics and PLC
concepts, but avoid mathematical detail that does not improve practical
understanding. Prefer direct international English, concrete examples, and a
clear progression from purpose to concept to application.

Respect existing page conventions and the user's working notes. Files under
`local_material/` are private working resources and may contain copyrighted
material. Use them for analysis when relevant, but do not move, publish, or
closely reproduce their contents unless the user explicitly requests an
appropriate transformation.

## Workflow

1. Read the target page and inspect `_quarto.yml`, adjacent pages, assets, CSS,
   bibliography entries, or scripts only when they affect the requested work.
2. For a new page or a substantial revision, delegate independent read-only
   reviews to `course_didactics_reviewer` and `robotics_plc_reviewer` when both
   perspectives are relevant. Run them in parallel, wait for both, and treat
   their findings as evidence for the main agent to assess rather than changes
   to apply automatically.
3. Preserve unrelated edits, rough notes, and project-specific information.
   Remove or relocate content only when the user asks or the task clearly
   requires it.
4. Use Quarto-native figures, videos, citations, equations, and cross-references
   where possible. Introduce figures and demonstrations in the body text and
   explain what the reader should learn from them. Prefer explicit section IDs
   for cross-references that other pages are likely to use. For substantial
   page work, also consider whether a difficult spatial relationship, sequence,
   state change, comparison, or signal flow needs a purposeful visualization;
   do not add media merely as decoration.
5. Keep page references order-agnostic. Describe what the linked page or section
   provides instead of calling it the previous or next page.
6. After editing, render the affected page with
   `quarto render pages/<page>.qmd`. Review warnings and inspect the generated
   HTML when rendering alone cannot confirm a cross-reference, diagram, media
   element, or interactive component.
7. After the final file change, update the `_quarto.yml` timestamp with
   `(Get-Item -LiteralPath '_quarto.yml').LastWriteTime = Get-Date` so the
   user's running Quarto preview reliably refreshes. Request the required
   filesystem approval if the sandbox blocks this operation.

For pages containing custom JavaScript, also run the repository's established
JavaScript syntax check and inspect the affected interaction in a browser when
the change can alter layout or behavior.

## Completion

Summarize the meaningful content changes and the validation performed. State
clearly when rendering, browser inspection, external verification, or a
specialist review could not be completed.
