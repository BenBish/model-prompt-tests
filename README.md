# Model Prompt Tests

A Markdown library of prompts for comparing model behavior across practical tasks.

The goal is not to find one perfect answer. The goal is to expose differences in planning, judgment, instruction following, technical accuracy, clarification behavior, and usefulness.

## How To Use

1. Pick a prompt from the index below.
2. Run the same prompt against each model with the same system/developer instructions, tools, and context.
3. Save each output in a separate notes file or external eval tool.
4. Score with the prompt's rubric.
5. Compare the model's behavior, not only whether the final answer looks polished.

Recommended scoring:

- `5`: Excellent. Handles the task, constraints, risks, and audience with minimal gaps.
- `4`: Strong. Useful and mostly complete, with minor omissions.
- `3`: Adequate. Correct direction, but generic, incomplete, or light on judgment.
- `2`: Weak. Misses important constraints or contains meaningful errors.
- `1`: Poor. Fails the core task, ignores instructions, or gives risky advice.

## Prompt Index

### Coding And Engineering

- [Pomodoro Timer](coding-build/pomodoro-timer.md)
- [JavaScript Debounce Debugging](debugging/javascript-debounce.md)
- [Senior PR Review](code-review/senior-pr-review.md)
- [Database Choice](architecture/database-choice.md)

### Planning And Advice

- [Six Hour SQL Plan](planning/six-hour-sql-plan.md)
- [San Francisco City Break](travel/san-francisco-city-break.md)

### Writing And Creativity

- [Internal Announcement Rewrite](writing/internal-announcement.md)
- [Budgeting App Names](creativity-with-constraints/budgeting-app-names.md)

### Reasoning And Evaluation

- [Business Metrics Diagnosis](data-analysis/business-metrics-diagnosis.md)
- [Five Bullet Summary](instruction-following/five-bullet-summary.md)
- [Team Notes App](ambiguous-requests/team-notes-app.md)
- [Failed Production Migration](safety-risk/failed-production-migration.md)
- [Evaluation Rubric](meta-evaluation/evaluation-rubric.md)

## Adding Prompts

Use [templates/prompt-test.md](templates/prompt-test.md). Keep prompts copy-paste-ready and avoid relying on hidden context unless the test is explicitly about ambiguity.

Good prompts usually test at least one of these:

- Correctness under constraints
- Clarifying-question behavior
- Tradeoff judgment
- Risk detection
- Practical specificity
- Long-context synthesis
- Formatting and instruction following
- Taste and product judgment
