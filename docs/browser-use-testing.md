# Layer 3 — Visual & Exploratory Browser Testing

Agent-driven, human-eyes-shaped verification. Not `npm test`, not
`npm run test:e2e`, not CI-gated, and not a fixed checklist of scenarios —
see issue #39.

## What this layer is for

- Layer 1 (Vitest) tests logic in isolation.
- Layer 2 (Playwright, `e2e/`) tests deterministic browser behavior via DOM
  assertions.
- Layer 3 exists for the class of bug that's **correct in the DOM but not
  actually visible or usable to a human** — something Playwright's
  selector-based assertions structurally can't catch. The reference case is
  #40: a search match's `<mark>` was present in the DOM exactly as expected,
  but scrolled out of a single-line `truncate` preview container, so no
  human ever actually saw it highlighted.
- Use it to: review new/changed UI before merging, spot-check visual
  rendering across the three viewport tiers, and sanity-check anything a
  human reported as "looks wrong" that a script wouldn't have had an
  assertion for in the first place.
- Don't duplicate a Playwright golden path here as a fixed script — if you
  catch yourself writing a repeatable pass/fail check, it belongs in `e2e/`
  instead.

## Setup

1. Run the app locally: `npm run dev` (or Docker) at `http://localhost:3000`.
2. Log in once with the real `APP_PASSWORD` for that environment. PlainDock's
   session is a 30-day httpOnly cookie, so a real browser profile stays
   logged in across sessions — no re-login ceremony per check, unlike
   Playwright's throwaway browser context.

## Two tools, two purposes

### `browser-use` — the default choice

The `browser-use` CLI attaches over CDP to your **actual, already-running
Chrome**, using your real profile and session. This is the operational
detail issue #39 calls out explicitly: it drives the browser you're already
looking at, not a spawned instance.

```bash
browser-use <<'PY'
new_tab("http://localhost:3000")
wait_for_load()
print(page_info())
PY
```

From there, interact with whatever the check actually needs — click through
the flow, resize the window, take a screenshot — using the helpers described
in the `browser-use` skill (`page_info()`, `click_at_xy()`, `js(...)`,
`cdp(...)`). If it can't connect, run `browser-use --doctor`.

**Foreground the tab for anything frame-timing-sensitive.** `new_tab()` and
`switch_tab()` move browser-use's own marker without necessarily bringing
Chrome's visible tab to the front. Chrome throttles `requestAnimationFrame`
on backgrounded tabs, so a check that depends on frame timing — e.g. the
Cmd/Ctrl+K focus-on-next-frame behavior from #40 — can silently look broken
if the tab isn't actually active. Call `activate_tab(target)` first for
anything like that (found the hard way during #40's testing).

### `chrome-devtools` (MCP) — for deeper technical inspection

Reach for the `chrome-devtools-mcp` tools instead when the check needs
something browser-use's screenshot-and-click flow doesn't give you directly:

- **Accessibility snapshot** — `take_snapshot` returns the full a11y tree;
  pair with the `a11y-debugging` skill for a structured audit.
- **Performance / Core Web Vitals** — `performance_start_trace` /
  `performance_stop_trace` / `performance_analyze_insight`, or the
  `debug-optimize-lcp` skill.
- **Lighthouse** — `lighthouse_audit` for a scored report.
- **Network / console inspection** — `list_network_requests`,
  `get_network_request`, `list_console_messages` — useful for diagnosing a
  failed save or a silent client error without instrumenting the app.
- **Viewport emulation** — `resize_page` to hit an exact width, more
  precise than manually resizing a real window.
- **Memory** — `take_heapsnapshot` / the `memory-leak-debugging` skill.

It doesn't share your logged-in Chrome profile the way `browser-use` does,
so log in via the `/login` form with the test `APP_PASSWORD` at the start of
that session. It's the better tool whenever the question is "what does the
browser's own instrumentation say," not "does this look right to a human."

## Viewport tiers to check

Per `CLAUDE.md`'s responsive design table — check the tier(s) relevant to
whatever changed, not all three every time:

| Tier    | Width      |
| ------- | ---------- |
| Mobile  | < 768px    |
| Tablet  | 768–1023px |
| Desktop | 1024px+    |

## Scheduling

Manual, pre-merge or pre-release only — never set up a recurring or
scheduled run for this layer. It's a deliberate human-in-the-loop review
step, not a gate.
