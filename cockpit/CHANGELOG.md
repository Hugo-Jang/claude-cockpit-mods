# Changelog

## 1.2.0 - 2026-10-23

### Changed
- The `Plan n/m` bar on line 2 is now read from a `progress(done, total)` tool that the mod registers, not from
  TodoWrite / TaskCreate / TaskUpdate. No step name is shown. The tool call stores the value at once, so the bar
  does not wait for `turn.complete`.
- The plan bar changes color with progress: orange (1-33%), yellow (34-66%), light green (67-99%), green (done).
- When all steps are done, only a bold green `✔` is shown (no "All done" text).
- The band border is orange, and the usage limits use softer green / yellow / red. The context weather colors
  and the picker colors are unchanged.

## 1.1.0 - 2026-10-21

### Changed
- The band is now always drawn in a rounded box, whatever the number of rows available.
- The layout is 4 rows including the border (it was 5): the model and effort pickers moved to line 1,
  followed by the usage limits, and the Resume / Rewind / Compact / Clear buttons moved to line 2, on the right.
- The model picker shows the actual model name (for example `Sonnet 5.5`) instead of the config alias.
- The effort mismatch warning (`⚠`) is now shown inside the Effort picker label.
- The confirmation row and the option menu appear as an extra line below the band, only while they are open.
  The pickers and buttons stay visible meanwhile.
- When the terminal is narrow, line 1 drops the picker prefixes first, then the Weekly reset, then the 5h reset.

### Removed
- The compact layouts for a low terminal: the borderless 3 line band, the merged line and the single line.
  A terminal shorter than 4 rows can now make the band overlap the prompt.

### Documentation
- Updated the README (English, Korean, Japanese) for the new layout: sketch, row table, how the band shrinks,
  and a note about the minimum height.
- Redrew the screenshots for the new layout and added one for a narrow terminal (`cockpit-narrow.png`).

## 1.0.1

- Add a space after the reset glyph to avoid overlap.

## 1.0.0

- Initial release.
