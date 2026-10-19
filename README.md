# claude-cockpit-mods

Claude Code mods by [Hugo-Jang](https://github.com/Hugo-Jang). Each folder is one complete plugin, and this repository is also a plugin marketplace, so you can install a mod with one command.

<!-- IMAGE 1: cockpit/README.md와 같은 화면. 파일명: cockpit/screenshots/cockpit-overview.png -->
![Cockpit above the Claude Code prompt](cockpit/screenshots/cockpit-overview.png)

| Mod | What it does |
| --- | --- |
| [`cockpit/`](cockpit/) | A cockpit above your prompt: model and effort, usage limits, a weather-style forecast of the context window, plan progress, model and effort pickers, and Resume / Rewind / Compact / Clear buttons that ask before they run. |

Each mod has its own README with details, in [English](cockpit/README.md), [한국어](cockpit/README.ko.md) and [日本語](cockpit/README.ja.md).

## Requirements

- Claude Code 2.1.303 or later. Older versions were not tested.
- A terminal.

## Install

```bash
claude plugin marketplace add Hugo-Jang/claude-cockpit-mods
claude plugin install cockpit-mods@claude-cockpit-mods --scope user
```

Or, inside a Claude Code session:

```text
/plugin install cockpit-mods --marketplace Hugo-Jang/claude-cockpit-mods
```

Restart Claude Code, or run `/reload-plugins`, so the mod loads.

To update later:

```bash
claude plugin marketplace update claude-cockpit-mods
claude plugin update cockpit-mods@claude-cockpit-mods
```

To remove it:

```bash
claude plugin uninstall cockpit-mods@claude-cockpit-mods
```

See the [Claude Code plugins documentation](https://code.claude.com/docs/en/plugins) for how plugins and marketplaces work, and for how to review a plugin before you install it.

## Author

[Hugo-Jang](https://github.com/Hugo-Jang)

## License

[MIT](LICENSE)

---

Shared as-is. Not an official Anthropic product; no support or maintenance is implied.
