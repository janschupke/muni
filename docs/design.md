# Colour and tokens

The palette, the surface layers and the colour contract `packages/ui/src/styles/tokens.test.ts` enforces.

One palette, defined once in `packages/ui/src/styles/tokens.css`:

- **Ramps** (`--ramp-*`) are the only place colour values live: a warm neutral ramp for
  surfaces, ink and hairlines; brand blue; and green, yellow, orange and red for signals.
  Steps run light (50) to dark (900). The signal ramps are built in OKLCH around the dataviz
  reference status colours (green 500, yellow 300, orange 400, red 500); the fills step away
  from them where a rule below needs it (light: green 600, yellow 550, orange 600, red 700;
  dark: green 500, yellow 300, orange 300, red 400).
- **Roles** (`--p-*`, used as Tailwind classes such as `bg-surface-elevated`,
  `text-success-fg`, `bg-status-expired`) pick a light and a dark step with `light-dark()`.
  The OS preference chooses the side unless the theme switch pins it (`data-theme`).
- **Surfaces are layers, and a higher layer is lighter** in both themes:

  | Layer                                                | Light       | Dark        |
  | ---------------------------------------------------- | ----------- | ----------- |
  | the page (`surface-base`); wells in cards (`sunken`) | neutral 100 | 950 / 900   |
  | cards, sidebar, top bar, footer (`surface-elevated`) | neutral 50  | neutral 850 |
  | dialogs, popovers, tooltips (`surface-overlay`)      | neutral 50  | neutral 800 |
  | form controls and secondary buttons (`control`)      | white       | neutral 750 |

  A field is the top layer wherever it sits, so it never shares its container's fill and
  needs no context. A disabled field drops its fill (`disabled:bg-transparent`) and its
  strong outline: flat against its container, so it cannot pass for an enabled one. A
  field's outline (`border-control`) has 3:1 against the field and every surface. In light,
  dialogs and popovers share the card fill and stand out by their shadow.

- **Translucent ink for what sits on any layer.** Bar tracks (`chart-track`), skeletons and
  neutral badges (`tint`) darken (or, in dark, lighten) whatever is under them, so a track
  shows in a card, on the page and in an opened row alike. Hover and press are state layers
  painted over an element's own fill (`layer-hover`, `layer-active`); a table row publishes
  its state as `--row-state`, which its pinned cells paint over their opaque fill
  (`layer-row`), so a row's hover reaches its pinned column.
- **Signals mean one thing each:** green = held, yellow = attention soon (expiring, a session
  80 % booked or full), orange = lapsed, red = action needed (missing, overbooked). Blue is
  the brand and never a state. A signal colour always comes with an icon and a label.
- **The colour contract** (`packages/ui/src/styles/tokens.test.ts`) reads `tokens.css` as data
  and checks every pairing the UI renders, in both themes, translucent roles composited first:
  a fill against what it sits on ΔE ≥ 0.02 (OKLab); a control's outline, a bar fill on its
  track and on every surface 3:1 (WCAG 1.4.11); text 4.5:1; any two signal fills ΔE ≥ 0.09,
  since they meet in stacked bars. Coloured text reads as a colour: the link, accent,
  success, warning, serious and danger inks each stand ΔE ≥ 0.10 from every text grey and
  0.09 from each other (warning would otherwise read as one more brown-grey). Fills read as
  their sentiment: the warning fill is a clear yellow (OKLab lightness ≥ 0.75) and the danger
  fill a full red (chroma ≥ 0.17, not pink), in both themes. No yellow reaches 3:1 on white, so
  every warning fill carries a 1px edge in the amber ink (`inset-ring-warning-edge`), and the
  edge is what meets 3:1. It also scans the app for colour classes: a role used
  anywhere but in no pairing fails, so a new use cannot skip the contract. The rendered pages
  are checked too ([testing](testing.md#accessibility-and-contrast)).
- **Compliance rates** are coloured by band (`complianceBand` in `@muni/domain`): 100 %,
  90–99 %, 75–89 %, 50–74 % and under 50 %, in plain sentiment colours: solid green, light
  green, yellow, orange, red (`bg-heat-*`). Neighbouring bands stay apart for colour-blind
  readers (ΔE ≥ 8.2); the closest pair overall, a green and the orange further down the
  scale, is ΔE 7.0, which the printed rate makes safe: every cell prints it, on an ink with at least
  4.8:1 contrast. Rate meters and the overview card use the same bands in the four signal
  colours (100 % and 90–99 % are both green). A rate is printed as its whole percent rounded
  down (`compliancePercent`, through `formatRate`), and the band is taken from that same
  number, so two cells that read the same are the same colour and only a full rate reads
  100 %. `compliance.test.ts` checks every count up to 300.

- **Links** are drawn one way, by `TextLink`: the link colour (`text-link`, blue-500 /
  blue-250), underlined only on hover. No link sits inside a sentence: in the dark theme no
  blue has both 3:1 against the body text and 4.5:1 on the dialog surface, so colour alone
  could not tell it from the words around it (WCAG 1.4.1). A label goes on its own line
  ("Department" over "Laboratoře") or a link stands in its own cell. Full email addresses are
  `mailto:` links (`EmailLink`).
- **Icon buttons** take the colour of what they do (`IconButton tone`): edit and undo accent,
  bring back success, archive and remove danger (one red for every destructive act; serious
  marks status only), with a soft fill of it on hover; close, clear-a-filter and the sidebar
  toggle stay grey.
- **Buttons:** in a group, one is primary (or danger, confirming a destructive act) and it
  comes last, on the right; the others, navigation included, are secondary, with a
  background; only a way back out is ghost (`CancelButton`). Starting a destructive act
  (Archive in a record's header) is `destructive`: secondary with the danger ink.
