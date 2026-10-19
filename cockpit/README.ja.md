[English](README.md) | [한국어](README.ko.md) | **日本語**

# Cockpit

Claude Code のセッションにコックピットを追加する mod です。天気予報風のコンテキストバンド、プランの進捗、使用量の上限、モデルと effort の切り替え、そして実行前に確認を挟む Resume / Rewind / Compact / Clear ボタンを備えています。

<!-- TODO: スクリーンショットまたは GIF を追加 -->
![Cockpit の概要](screenshots/cockpit-overview.png)

## 機能

<!-- TODO: ターミナルでのバンドの見た目をテキストで貼り付け -->

| 要素 | 内容 |
| --- | --- |
| コンテキストバンド | コンテキストウィンドウの使用状況を天気予報風に表示します。 |
| プラン進捗 | 現在のプランの進み具合を表示します。 |
| 使用量の上限 | 使用量の上限に対する消費量を表示します。 |
| モデル切り替え | コックピットからモデルを切り替えます。 |
| Effort 切り替え | コックピットから reasoning effort を切り替えます。 |
| Resume / Rewind / Compact / Clear | 同名のコマンドを実行するボタンです。実行前に必ず確認が入ります。 |

## デモ

<!-- TODO: 状態ごとのスクリーンショットと一行の説明 -->

## 仕組み

この mod は、hooks モジュール 1 つ（`hooks/register.tsx`）と補助関数（`hooks/lib.ts`）で構成されています。

| Hook | 役割 |
| --- | --- |
| <!-- TODO --> | <!-- TODO --> |

<!-- TODO: モジュールが実際に使うイベントと ui.render コンポーネントを列挙 -->

## 使い方

**動作要件**

- Claude Code <!-- TODO: 動作確認した最小バージョン --> 以降（mod がデフォルトで読み込まれるバージョン）
- ターミナル環境 <!-- TODO: 他の環境への対応可否 -->

**このリポジトリからインストール**

```bash
claude plugin marketplace add Hugo-Jang/claude-cockpit-mods
claude plugin install cockpit-mods@claude-cockpit-mods --scope user
```

Claude Code のセッション内では次のように入力します。

```text
/plugin install cockpit-mods --marketplace Hugo-Jang/claude-cockpit-mods
```

**インストールせずに 1 セッションだけ試す**

```bash
git clone https://github.com/Hugo-Jang/claude-cockpit-mods.git
cd claude-cockpit-mods
claude --plugin-dir ./cockpit
```

**開発とテスト**

```bash
claude plugin validate ./cockpit
claude plugin test ./cockpit
```

## 注意事項 / 制限

<!-- TODO: 例 -->
- <!-- 正確な数値と推定値の区別 -->
- <!-- 他のプラグインがプロンプト上のバンドを描画する場合の挙動 -->
- <!-- セッション開始やプラグインのリロードでリセットされる項目 -->

## 依存関係

| 名前 | バージョン | ライセンス (SPDX) | 入手元 |
| --- | --- | --- | --- |
| なし | | | |

## サードパーティ通知

なし。

## 作者

[Hugo-Jang](https://github.com/Hugo-Jang)

## ライセンス

[MIT](../LICENSE)

---

現状のまま共有しています。Anthropic の公式製品ではなく、サポートやメンテナンスは保証されません。
