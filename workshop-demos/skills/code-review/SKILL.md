---
name: code-review
description: Review a code change systematically and report actionable findings.
---

# Code review

1. Establish the intended behavior before judging the implementation.
2. Trace inputs through every changed branch and check boundary conditions.
3. Look for correctness, security, performance, and maintainability issues.
4. Check whether tests cover both the happy path and the failure you found.
5. Report only actionable findings, ordered by severity. Include the relevant line.
6. If there are no findings, say so plainly and mention any residual testing gap.
