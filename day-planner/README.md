# day planner

1日のスケジュールをカレンダー・タスクボード・Markdown で管理する Web アプリです。

## 機能

- 時間軸カレンダー（ドラッグで予定作成・移動・リサイズ）
- タスクボード / Markdown ビュー
- ルーティン、タグ別の挙動、通知（音・ポップアップ・画像）
- 分析パネル（完了 / 未完了 / 空き時間）

## 使い方

### ローカル（ファイル保存あり）

`data.json` に予定を保存する Python サーバー付きです。

```bash
./start.sh
```

ブラウザで `http://127.0.0.1:8781/` を開きます。

初回のみ `data.example.json` をコピーして使えます。

```bash
cp data.example.json data.json
```

### GitHub Pages（Web 公開）

静的ホスティングでは **ブラウザの localStorage のみ** にデータを保存します。サーバー API は使いません。

## GitHub Pages で公開する手順

**推奨: このフォルダだけを専用リポジトリにする**（個人メモ全体のリポジトリは公開しない）

1. GitHub で新リポジトリを作成（例: `day-planner`）
2. このフォルダの中身をリポジトリのルートに push  
   ※ `data.json` は `.gitignore` 済みなので含まれません
3. リポジトリの **Settings → Pages → Build and deployment**
   - Source: **GitHub Actions**
4. `main` ブランチに push すると `.github/workflows/pages.yml` が自動デプロイします
5. 数分後 `https://<username>.github.io/day-planner/` で公開されます

### 手動デプロイ用ファイル

| 公開する | 公開しない（セキュリティ） |
|---------|---------------------------|
| `index.html`, `app.js`, `style.css` | `data.json`（個人の予定） |
| `notification-images/manifest.json` | `server.py`, `start.sh` |
| `.nojekyll` | `notification-images/*.jpg` 等（アップロード画像） |

## セキュリティについて

- **Web 版**: 予定・設定・通知画像は端末内の localStorage のみ。外部サーバーへ送信しません
- **ローカル版**: `data.json` と通知画像は自分の PC 上のこのフォルダにのみ保存
- **公開前チェック**
  - `data.json` が commit されていないか `git status` で確認
  - 通知画像フォルダに個人画像が残っていないか確認
- **Content-Security-Policy** を HTML に設定済み（外部スクリプト読み込みを禁止）
- 公開環境では `localhost` 以外で API（`/api/data` 等）を呼ばないよう制御済み

## ライセンス

個人利用を想定。必要に応じて追記してください。
