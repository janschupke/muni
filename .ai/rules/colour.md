# Colour

One palette in `packages/ui/src/styles/tokens.css`, checked as data by
`packages/ui/src/styles/tokens.test.ts`. Deep reference:
[README § Colour](../../README.md#colour).

## Rules

- **Ramps hold every colour value; roles pick from them.** Components use role classes
  (`bg-surface-elevated`, `text-success-fg`), never a raw ramp or a hex value.
- **A higher surface layer is lighter, in both themes;** a field is the top layer wherever it
  sits. A disabled field drops its fill and strong outline.
- **Signals mean one thing each:** green held, yellow attention soon, orange lapsed, red action
  needed; blue is the brand, never a state. A signal colour always has an icon and a label.
- **Every rendered pairing is in the contract.** A new role or a role used in a new place is
  added to `tokens.test.ts` pairings; the test fails on a colour class used anywhere but in no
  pairing.
- **WCAG contrast cannot see hue:** separate fills in OKLab ΔE, spend chroma not lightness.
- **Translucent state colours need a background layer** under them (`layer-hover`,
  `layer-row`).
- **Motion lives in `tokens.css`;** `prefers-reduced-motion` turns it off in one rule.
