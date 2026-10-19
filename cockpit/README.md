[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

# Cockpit

A Claude Code mod that puts a cockpit around your session: a weather-style context band, plan progress, usage limits, model and effort pickers, and Resume / Rewind / Compact / Clear buttons that ask for confirmation before they run.

<!-- TODO: add a screenshot or GIF -->
![Cockpit overview](screenshots/cockpit-overview.png)

## What this shows

<!-- TODO: paste a text sketch of the band as it looks in your terminal -->

| Part | What it does |
| --- | --- |
| Context band | Shows how full the context window is, in a weather-style forecast. |
| Plan progress | Shows progress through the current plan. |
| Usage limits | Shows how much of your usage limits you have used. |
| Model picker | Switches the model from the cockpit. |
| Effort picker | Switches the reasoning effort from the cockpit. |
| Resume / Rewind / Compact / Clear | Buttons for the matching commands. Each asks you to confirm before it runs. |

## Demo

<!-- TODO: one screenshot per state, with a one-line caption each -->

## How it works

The mod is one hooks module (`hooks/register.tsx`) with helpers in `hooks/lib.ts`.

| Hook | What it does |
| --- | --- |
| <!-- TODO --> | <!-- TODO --> |

<!-- TODO: list the events and ui.render components the module actually uses -->

## Run it

**Requirements**

- Claude Code <!-- TODO: minimum version you tested on --> or later, where mods load by default.
- A terminal. <!-- TODO: say whether other surfaces are supported -->

**Install from this repository**

```bash
claude plugin marketplace add Hugo-Jang/claude-cockpit-mods
claude plugin install cockpit-mods@claude-cockpit-mods --scope user
```

Or, inside a Claude Code session:

```text
/plugin install cockpit-mods --marketplace Hugo-Jang/claude-cockpit-mods
```

**Try it for one session, without installing**

```bash
git clone https://github.com/Hugo-Jang/claude-cockpit-mods.git
cd claude-cockpit-mods
claude --plugin-dir ./cockpit
```

**Develop and test**

```bash
claude plugin validate ./cockpit
claude plugin test ./cockpit
```

## Notes / limitations

<!-- TODO: for example -->
- <!-- Which numbers are exact and which are estimates -->
- <!-- What happens when another plugin draws the same band above the prompt -->
- <!-- Anything that resets when the session starts or the plugin reloads -->

## Dependencies

| Name | Version | License (SPDX) | Source |
| --- | --- | --- | --- |
| None | | | |

## Third-party notices

None.

## Author

[Hugo-Jang](https://github.com/Hugo-Jang)

## License

[MIT](../LICENSE)

---

Shared as-is. Not an official Anthropic product; no support or maintenance is implied.
