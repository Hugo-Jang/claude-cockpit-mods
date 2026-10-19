# claude-cockpit-mods

Claude Code mods. One folder per mod; each folder is a complete plugin.

| Mod | What it does |
| --- | --- |
| [`cockpit/`](cockpit/) | A cockpit around your session: context band, plan progress, usage limits, model and effort pickers, and confirmed Resume / Rewind / Compact / Clear buttons. |

## Install

```bash
claude plugin marketplace add Hugo-Jang/claude-cockpit-mods
claude plugin install cockpit-mods@claude-cockpit-mods --scope user
```

Or, inside a Claude Code session:

```text
/plugin install cockpit-mods --marketplace Hugo-Jang/claude-cockpit-mods
```

See the [Claude Code plugins documentation](https://code.claude.com/docs/en/plugins) for how plugins and marketplaces work, and for how to review a plugin before you install it.

## Author

[Hugo-Jang](https://github.com/Hugo-Jang)

## License

[MIT](LICENSE)
