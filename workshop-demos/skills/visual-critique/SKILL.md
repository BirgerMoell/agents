---
name: visual-critique
description: Improve an image through one evidence-based visual feedback cycle.
---

# Visual critique loop

1. Turn the request into a concrete prompt with subject, setting, composition, lighting, palette, mood, and medium.
2. Generate version one with seed 42.
3. Inspect the actual pixels with the vision model. Identify two strengths and at most three visible problems.
4. Produce a revised prompt that fixes those problems without changing the user's intent.
5. Generate version two with the same seed so the prompt change is the main variable.
6. Show both paths and the critique. Never claim an improvement that was not grounded in the inspected image.
