# Mindra Light

カスタム Electron ベースの軽量AIブラウザ。

Ver 0.6.0 メモ
・ダウンロードボタンはデモのみ
・ブックマークはインターフェース未作成
・設定画面からのプロファイル追加はバグ有り


## インストール

    npm install

------------------------------------------------------------------------

## ローカルでの実行方法

    npm start

------------------------------------------------------------------------

## ローカルビルド方法（パッケージ作成）

    npm run build

`dist/` フォルダに各 OS 向けのパッケージが生成されます。

------------------------------------------------------------------------

## GitHub Actions 自動ビルド

`.github/workflows/build.yml` により次が自動生成されます：

-   Windows（.exe）
-   macOS（.app / .dmg）
-   Linux（AppImage / deb）

成果物は Artifact として保存されます。

------------------------------------------------------------------------

## Ollama のインストールとモデル導入（Llama3:8B 推奨）

### 1. Ollama のインストール

#### Windows
1. 公式サイトを開く → https://ollama.com/download
2. Windows インストーラーをダウンロード
3. 実行して完了（自動でバックグラウンド起動）

#### macOS
1. dmg をダウンロードして Applications へ
2. 起動すれば OK

#### Linux（Ubuntu 例）
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

---

### 2. 動作確認
```bash
ollama --version
ollama list
```

---

### 3. 推奨モデル（qwen2.5:7b-instruct）
```bash
ollama pull qwen2.5:7b-instruct
```

---

### 4. テスト実行
```bash
ollama run qwen2.5:7b-instruct
```

---

### 5. モデル管理
```bash
ollama list
ollama rm qwen2.5:7b-instruct
```

------------------------------------------------------------------------

## ライセンス

-   本体：MIT\
