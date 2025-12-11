# Change Log — Context-Aware Suggestions (JSX/HTML)

All notable changes to the "context-aware-suggestions" extension will be documented in this file.

## [Unreleased]

- Disable suggestions inside JSX/HTML text nodes while keeping completions in code, props/attributes, and expressions.
- Optional cache TTL (`jsxContextSuggestions.cacheTtlMs`) for context detection.
- Quick suggestions are toggled automatically and restored safely on context changes.
