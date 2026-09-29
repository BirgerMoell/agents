---
name: multiplication
description: Multiply numbers and explain multiplication steps. Use when the user asks to multiply integers/decimals/fractions, requests long multiplication, times tables, products, or wants step-by-step multiplication and checks.
---

# Multiplication skill

Use this skill when the user asks to **multiply** numbers or wants an explanation of multiplication.

## What to ask first (only if needed)
- If the numbers are ambiguous (e.g., “multiply 3 by 4 by 5”), confirm grouping only when it matters; otherwise multiply left-to-right.
- If units are present, keep units consistent and multiply the numeric parts; report resulting squared/cubed units if applicable.
- If rounding/precision is required, ask for the desired number of decimal places or significant figures.

## How to respond
1. **Restate the expression** clearly (e.g., `23.4 × 0.06`).
2. Compute the **exact product** when possible.
3. If the user requests it (or if it helps learning), provide **step-by-step**:
   - Integers: long multiplication layout.
   - Decimals: multiply as integers then place the decimal point by counting decimal places.
   - Fractions: multiply numerators and denominators; simplify by cross-cancellation.
   - Signed numbers: state the sign rule (same signs → positive; different → negative).
4. Provide a quick **reasonableness check** (estimation) for non-trivial problems.

## Methods

### Integers (long multiplication)
- Multiply the top number by each digit of the bottom number (right to left), tracking carries.
- Shift left (add a zero) for each new place value.
- Sum partial products.

### Decimals
- Remove decimals temporarily (treat as integers).
- Multiply.
- Put the decimal back: total decimal places = sum of decimal places in factors.

### Fractions
- `(a/b) × (c/d) = (a×c)/(b×d)`
- Simplify:
  - Reduce each fraction first.
  - Cross-cancel common factors between numerator and denominator.

### Large numbers
- Use chunking (e.g., split into thousands/millions) or scientific notation.
- For exact results, keep integer arithmetic; for approximations, use scientific notation with specified precision.

## Examples

### Example: decimals
`23.4 × 0.06`
- Multiply as integers: `234 × 6 = 1404`
- Decimal places: `1 + 2 = 3` → `1.404`

### Example: fractions
`(3/8) × (20/9)`
- Cross-cancel: `20` with `8` → `20/8 = 5/2`
- Now: `(3/2) × (5/9) = 15/18 = 5/6`

## Error handling
- If the user provides non-numeric inputs, ask for clarification.
- If multiplication would overflow typical integer sizes, still compute exactly (arbitrary precision) or ask whether approximation is acceptable.
