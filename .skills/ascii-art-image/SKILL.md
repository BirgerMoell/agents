---
name: ascii-art-image
description: Create pictures using only ASCII characters. Use when the user asks for ASCII art, text-only images, terminal art, banners, or monochrome drawings made from characters.
---

# ASCII Art Image Creation

Create an image using **only ASCII characters** (7-bit printable characters). Output must be plain text in a monospaced layout.

## When to use
- The user asks for **ASCII art**, **text art**, **terminal art**, **character-based drawings**, or an "image" made from characters.
- The user wants an ASCII logo, icon, scene, portrait, or diagram.

## Constraints (must follow)
1. **ASCII-only**: Use characters in the printable ASCII range.
   - Allowed examples: letters A–Z/a–z, digits 0–9, space, punctuation like `.-_=/\\|()[]{}<>:+*#@'\"`, etc.
   - Avoid Unicode box-drawing, emojis, braille blocks, or shaded block characters.
2. **Monospace-friendly**: Assume a fixed-width font; align with spaces.
3. **No external images**: Do not reference or embed non-text images.
4. **Deliver as a code block**: Always wrap final art in a fenced code block for alignment.

## Clarify requirements (ask if missing)
Ask up to 3 quick questions if the user hasn’t specified:
- Subject: What should the ASCII image depict?
- Size: Desired width/height (e.g. 40x20, 80 columns), and where it will be displayed (terminal, README).
- Style: Outline vs shaded, realistic vs cartoon, character set preference (e.g. `#` shading), and whether text/caption is needed.

If the user says "surprise me", choose a default: ~60–80 columns wide, simple shaded style using ` .:-=+*#%@`.

## Process
1. **Choose canvas size**
   - Default: width 60–80 characters; height proportional (20–30 lines).
   - Ensure it fits typical terminals (80 columns) unless the user requests otherwise.
2. **Pick a character palette**
   - Outline: `._-=/\\|()`
   - Shading: ` .:-=+*#%@` (space = lightest)
   - Dense fill: `#%@`
3. **Draft silhouette**
   - Block out main shapes with spaces and a mid-tone character.
4. **Add details**
   - Use darker characters for shadows; lighter for highlights.
   - Maintain symmetry when appropriate.
5. **Clean up alignment**
   - Remove trailing spaces when possible, but don’t break alignment.
   - Keep consistent line lengths if the output is meant for strict rendering.

## Output format
Return:
- Optional 1-line title above the code block (ASCII-only).
- The ASCII art inside a fenced code block.
- Optionally a short note: dimensions (width x height) and palette used.

## Safety/Content guidelines
- If asked to depict disallowed content, refuse and offer a safe alternative (e.g. abstract pattern, landscape, mascot).
- Avoid generating hateful or harassing imagery.

## Examples (minimal)

### Small icon (cat)
```text
 /\_/\\
( o.o )
 > ^ <
```

### Simple banner
```text
  ____   ____  ____ ___ ___
 / ___| / ___||  _ \_ _/ _ \\
| |     \___ \| |_) | | | | |
| |___   ___) |  __/| | |_| |
 \____| |____/|_|  |___\___/
```

See also: references/ASCII-PALETTES.md
