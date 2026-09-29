---
name: local-image-generation
description: Turn a user's visual idea into one polished image using the local Apple-Silicon generator.
---

# Local image generation

1. Preserve the user's subject, intent, and requested style. Do not silently replace them.
2. Convert the request into one concrete visual scene. Specify subject, setting, composition,
   lighting, colour palette, mood, and medium in a compact prompt.
3. Prefer a clear focal point and a coherent composition over a long list of unrelated details.
4. Do not ask the image model to explain anything. The prompt should describe only visible content.
5. Call `generate_image` exactly once with the finished prompt and seed `42` unless the user
   explicitly supplies another seed.
6. After generation, report the exact output path, model, seed, and final prompt. Never claim that
   an image was created if the tool returned an error.
