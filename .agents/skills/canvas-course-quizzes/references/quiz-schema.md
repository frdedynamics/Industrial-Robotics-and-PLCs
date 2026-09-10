# Quiz Source Schema

The QTI builder reads a UTF-8 JSON object. Review metadata remains in the source
file but is not exported to Canvas.

```json
{
  "title": "Quiz title",
  "description": "Short learner-facing description.",
  "purpose": "What this formative quiz should reveal or reinforce.",
  "assumed_prerequisites": ["Reasonable entry knowledge assumed for this quiz."],
  "source_pages": ["pages/example.qmd"],
  "quiz_type": "practice_quiz",
  "shuffle_answers": true,
  "show_correct_answers": true,
  "allowed_attempts": 1,
  "questions": [
    {
      "title": "Stable internal question title",
      "question_type": "single_choice",
      "points": 1,
      "learning_objective": "Diagnose ...",
      "relevance": "Why this matters in the course or project.",
      "source_sections": ["pages/example.qmd#section-id"],
      "connections": ["Relation to another course concept, or an empty list."],
      "cognitive_level": "apply",
      "prompt": "Question shown to the learner?",
      "choices": ["Choice A", "Choice B", "Choice C", "Choice D"],
      "correct": 1,
      "distractor_rationales": [
        "Misconception represented by A.",
        "",
        "Misconception represented by C.",
        "Misconception represented by D."
      ],
      "correct_feedback": "Why the correct answer is correct.",
      "incorrect_feedback": "Explanation that repairs the central misunderstanding."
    }
  ]
}
```

`assumed_prerequisites` must be an explicit list and may be empty. Include only
common knowledge or basic prior automation knowledge that is reasonable for the
course audience. `source_pages` must identify learner-visible course pages or
resources that are explicitly assigned. Together, these fields define the
answerability boundary; private notes and instructor solutions are not learner
sources.

`question_type` can currently be `single_choice`, `multiple_answer`, or
`true_false`. For single choice and true/false, `correct` is one zero-based
choice index. For multiple answer, it is a list of two or more zero-based
indices, for example `"correct": [0, 2]`. A true/false item must have exactly
the choices `True` and `False`.

`cognitive_level` is one of `remember`, `understand`, `apply`, or `analyze`.
Use `remember` sparingly. Supply three to five choices except for true/false.
Every incorrect choice needs a non-empty entry in `distractor_rationales`; use
an empty string at each correct-answer index.
