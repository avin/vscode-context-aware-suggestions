# Context-Aware Suggestions (JSX/HTML)

Disable code suggestions only when your cursor is inside JSX or HTML/XML text nodes while keeping completions for code, props, and expressions. Emmet stays intact.

## What it does
- Hides autocompletion when the caret is inside plain text of JSX/HTML elements (e.g., `<div>|text</div>`).
- Keeps suggestions for code, props/attributes, expressions, and Emmet.
- Works in React files (`typescriptreact`, `javascriptreact`, `.ts/.js` with JSX) and markup files (`html`, `xml`, `xhtml`, `svg`).

## Usage
Install and start typing in JSX. Completions disappear only inside plain text of JSX elements; everywhere else they behave normally.

## Recommended settings for Emmet
Add this to your settings to expand Emmet on Tab inside TSX/JSX:

```json
{
  "emmet.triggerExpansionOnTab": true,
  "emmet.includeLanguages": {
    "javascript": "javascriptreact",
    "typescript": "typescriptreact"
  }
}
```
