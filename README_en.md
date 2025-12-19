# Mindra Light

**Mindra Light** is an AI-enabled browser that uses free, local LLMs  
without requiring any API keys.

It is designed to integrate AI and browsing entirely within a local environment,  
without relying on external AI services.

Mindra Light explores original UI and interaction ideas such as split-view layouts,  
dual-stage profiles, and vertical tab navigation.

---

## About the Project

Mindra Light is a personal project focused on exploring  
how individuals can practically integrate AI into everyday workflows.

It prioritizes local, self-contained AI usage without subscriptions or API keys,  
and evolves through continuous real-world use.

---

## Features

- No API keys required (local LLM integration)
- Designed for free and local AI usage
- Split-view browsing for working with multiple pages simultaneously
- Dual-stage profiles for separating different usage contexts
- Vertical tabs for improved visibility and navigation
- Unique UI concepts distinct from conventional browsers

---

## Supported Platforms

- Windows  
- macOS  
- Linux  

Prebuilt binaries are available via GitHub Releases.

---

## Installation (For Users)

1. Open the GitHub Releases page  
2. Download the package for your operating system  
3. Install or extract and launch the application  

Linux users can use AppImage or deb packages.

---

## macOS Notes

On macOS, a security warning may appear on first launch  
because the application is not code-signed.

If this happens:

1. Right-click (or Control-click) the app
2. Select **Open**
3. Click **Open** again in the confirmation dialog

Alternatively:

- Open **System Settings** → **Privacy & Security**
- Allow the app under the security section

This is a standard macOS security behavior and not an issue with the application.

---

## Local LLM Integration (Ollama)

Mindra Light integrates with **Ollama** to provide AI features  
using local LLMs without API keys.

### Install Ollama

#### Windows / macOS
https://ollama.com/download

#### Linux (Ubuntu example)

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

---

### Recommended Model

```bash
ollama pull qwen2.5:7b-instruct
```

---

### Test the Model

```bash
ollama run qwen2.5:7b-instruct
```

---

## License

MIT License
