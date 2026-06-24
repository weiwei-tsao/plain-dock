---
name: extend-sanitizer
description: Add allowed tags, dangerous tags, CSS properties, URL protocols, or tag normalizations to the sanitizer pipeline. Includes ProseMirror CSS side-effect checklist.
---

The sanitizer has 4 configuration arrays in one file and 1 normalization map in another. Identify which extension point matches your goal, then follow the steps for that point.

## Extension Point Map

| Goal | File | What to edit |
|------|------|--------------|
| Allow a new HTML tag to survive sanitization | `src/lib/sanitizer/config.ts` | `ALLOWED_TAGS` |
| Strip a tag and all its children entirely | `src/lib/sanitizer/config.ts` | `DANGEROUS_TAGS` |
| Preserve a new CSS property on elements | `src/lib/sanitizer/config.ts` | `ALLOWED_STYLES` |
| Allow a new URL scheme on `<a href>` | `src/lib/sanitizer/config.ts` | `ALLOWED_PROTOCOLS` |
| Remap one tag to another during normalization | `src/lib/sanitizer/normalize.ts` | `TAG_NORMALIZE_MAP` |
| Change how tables or media are downgraded | `src/lib/sanitizer/index.ts` | Layer 3 logic (hardcoded) |

---

## Adding an Allowed Tag

`src/lib/sanitizer/config.ts`:

```ts
export const ALLOWED_TAGS = [
  // existing tags...
  'mark',   // ← add here
];
```

**Required follow-up:** If the tag has visible styling in a browser, add matching ProseMirror CSS to `src/app/globals.css`:

```css
.ProseMirror mark {
  background-color: #fef08a;
  color: inherit;
}
```

Without the CSS rule, the tag survives sanitization but renders unstyled (or invisible) in the RICH editor. This is the most common oversight when adding new tags.

---

## Adding a Dangerous Tag

`src/lib/sanitizer/config.ts`:

```ts
export const DANGEROUS_TAGS = [
  // existing tags...
  'canvas',  // ← add here
];
```

Dangerous tags are stripped along with **all their children**. Use this for tags that pose security or privacy risks regardless of content.

---

## Allowing a New CSS Property

`src/lib/sanitizer/config.ts`:

```ts
export const ALLOWED_STYLES = [
  // existing: 'color', 'background-color', 'text-decoration'
  'font-weight',  // ← add here
];
```

Only properties listed here survive the style attribute cleanup. All others are removed from every element.

---

## Adding a URL Protocol

`src/lib/sanitizer/config.ts`:

```ts
export const ALLOWED_PROTOCOLS = [
  // existing: 'http', 'https', 'mailto'
  'tel',  // ← add here
];
```

Anchor `href` values that don't start with an allowed protocol are removed. `target="_blank"` and `rel="noopener noreferrer"` are always enforced on links regardless of this list.

---

## Adding a Tag Normalization

`src/lib/sanitizer/normalize.ts`:

```ts
export const TAG_NORMALIZE_MAP: Record<string, string> = {
  // existing mappings...
  b: 'strong',
  i: 'em',
  div: 'p',
  ins: 'u',   // ← add here
};
```

Normalization runs in Layer 2, before the allowed-tag filter. The source tag is replaced by the target tag in-place, preserving children and attributes. The target tag must be in `ALLOWED_TAGS` or it will be flattened in the final cleanup.

---

## Changing Table or Media Handling (Layer 3)

Layer 3 is hardcoded in `src/lib/sanitizer/index.ts`. It handles:
- `table` → tab-separated `<p>` (one per row)
- `img`, `video` → `[TAG: src]` text placeholder

To change this behaviour, edit the relevant section directly in `index.ts`. There is no config array for Layer 3 — it is intentionally opinionated.

---

## Verification Checklist

After any sanitizer change:

- [ ] Paste HTML containing the new tag/style into a RICH note and confirm it renders correctly
- [ ] Paste HTML containing a tag that should be stripped and confirm it disappears
- [ ] Run `npm run typecheck` and `npm run lint`
- [ ] If a new tag was added: confirm the ProseMirror CSS in `globals.css` renders it visually

---

## Commit

Use `/git-commit` with scope `sanitizer`:

```
feat(sanitizer): allow <tag> in rich paste content
```
