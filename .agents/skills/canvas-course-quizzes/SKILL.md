---
name: canvas-course-quizzes
description: Design, review, package, and validate formative Canvas LMS quizzes from this industrial robotics and PLC course, with learner-answerability checks, diagnostic answer choices, and required feedback.
---

# Canvas Course Quizzes

Use this workflow when creating or revising a Canvas quiz from the course's
Quarto pages. The exporter produces QTI 1.2 packages. Single-choice questions
have been tested successfully with Canvas New Quizzes; multiple-answer and
true/false questions are supported for compatibility testing until their Canvas
import behavior has also been confirmed.

Store quiz sources, answer keys, review notes, generated XML, and ZIP packages
under `local_material/lms/quizzes/<quiz-name>/`. This directory is private and
Git-ignored. Do not place answer keys in public course pages.

## Design Gate

Do not start by converting page sentences into questions. First read the target
page and only the linked course or project sections needed to understand its
role. Make a short coverage map containing:

- the learning objective expressed as something the learner should be able to
  distinguish, choose, interpret, diagnose, or apply;
- why that objective matters in the course, project, or industrial practice;
- useful connections to other course topics;
- a suitable question situation, response format, and cognitive level;
- whether a quiz question is actually a useful way to assess it.

Select fewer objectives when the remaining material would only support trivia
or repetitive recall. Cross-page connections should strengthen a meaningful
concept; do not force one into every item.

Define the learner's assumed entry knowledge in `assumed_prerequisites` before
drafting questions. Keep it limited to reasonable common knowledge and basic
automation knowledge for this course audience. The course page does not need to
state the answer verbatim: learners should normally be able to reason to it from
the concepts taught on the target page, supported where appropriate by linked
course pages, explicitly assigned resources, and the declared prerequisites.

Do not require access to private `local_material`, an instructor solution,
unassigned external documentation, undocumented vendor behavior, or unstated
specialist knowledge. Private notes and external sources may be used to check
technical accuracy, but they do not make a question answerable to the learner.
If essential knowledge is missing, add it to the learner-facing material,
explicitly assign the source, declare a reasonable prerequisite, or revise the
question.

## Question Drafting

Default to a low-stakes formative quiz unless the user specifies otherwise.
Choose the number of attempts and feedback timing deliberately. A formative
quiz should normally let learners use the feedback in a later attempt unless
showing the complete answer immediately would make that retry meaningless.
Choose the response format from the learning objective. A varied quiz can make
the work less repetitive, but variation is secondary to validity:

- use **single choice** when the learner must select one best interpretation,
  diagnosis, or action;
- use **multiple answer** when several independent conditions or statements are
  simultaneously correct. State `Select all that apply` or the required number
  of selections in the prompt;
- use **true/false** only for a consequential binary claim or common
  misconception, not as an easy way to increase the question count.

Do not reshape a good question merely to alternate formats. Matching, ordering,
numeric, and written-response items may be useful for other objectives, but
they require separate exporter support and a Canvas import test before use.

For every selected-response item:

- write one unambiguous prompt with one clearly best answer;
- prefer a practical decision, interpretation, or fault diagnosis over recall
  of interface labels;
- make each wrong choice represent a plausible misconception, reversed role,
  incomplete action, or realistic but unsuitable alternative. For
  multiple-answer items, also consider likely combinations of omitted correct
  choices and incorrectly selected distractors;
- keep choices parallel in grammar, detail, and conceptual level;
- reject choices that are absurd, unrelated, or easy to eliminate without
  understanding the course material;
- provide correct feedback that explains the principle and incorrect feedback
  that repairs the misunderstanding;
- use direct international English without tricks, unnecessary negatives, or
  unexplained terminology.

Record the learning objective, relevance, source section, cognitive level,
connections, and rationale for every distractor in `quiz.json`. These fields
support review and are not displayed in Canvas. Read
[the quiz schema](references/quiz-schema.md) when creating that file.

## Review Gate

Before building QTI, run independent read-only reviews when delegation is
available:

1. `course_assessment_reviewer` checks learning value, coverage, course and
   project relevance, learner answerability, connections, distractors,
   language, and feedback.
2. `robotics_plc_reviewer` checks technical correctness and whether general,
   vendor-specific, and project-specific behavior are distinguished. For quiz
   reviews, it also distinguishes a technically true claim from one learners
   can support using the available course material and stated prerequisites.

Revise the quiz after evaluating both reviews. Do not package an item marked
Remove or one with an unresolved correctness concern. Use
[the assessment rubric](references/assessment-rubric.md) for the final local
check when an agent is unavailable. As a final answerability audit, verify that
the taught concepts let the learner justify the correct answer and reject each
distractor without needing hidden or out-of-scope information.

## Build And Validate

Build the reviewed source with:

```powershell
python .agents/skills/canvas-course-quizzes/scripts/build_qti.py `
  local_material/lms/quizzes/<quiz-name>/quiz.json
```

The script validates the review metadata, question structure, feedback, XML,
manifest contents, and ZIP integrity before writing the QTI package beside the
source file. Treat a successful build as format validation, not proof of
assessment quality.

Canvas import is the final compatibility check. Keep the imported quiz
unpublished initially and verify each question's displayed type, selection
rules, scoring, answers, points, and both correct and incorrect feedback after
submission. Do not treat a newly implemented question type as established until
that check succeeds in Canvas New Quizzes.
