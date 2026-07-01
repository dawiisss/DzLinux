# <img width="45" height="45" alt="icon" src="https://github.com/user-attachments/assets/7af6cc2e-344f-4047-9085-153c2b890d9c" /> DzLinux — DayZ Launcher, Server Browser and Mod Manager for Linux

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/dawiisss/DzLinux?color=brightgreen&logo=github)](https://github.com/dawiisss/DzLinux/releases/latest)
[![Platform support](https://img.shields.io/badge/platform-Linux-orange?logo=linux)](https://github.com/dawiisss/DzLinux)

DzLinux is a high-performance, native launcher, server browser, and mod manager for playing **DayZ on Linux**. It features dynamic Proton version detection, real-time server querying via A2S, automatic Steam Workshop mod verification, performance tuning (MangoHud, GameMode), and native desktop watchlist notifications.

Play modded and vanilla DayZ on Linux with a zero-setup, optimized launcher.

---

## Quick Install

Run this command in your terminal to automatically detect your system and install the latest version (.deb, .rpm, or AppImage):

```bash
curl -sSL https://raw.githubusercontent.com/dawiisss/DzLinux/main/install.sh | bash
```

---

## Table of Contents
* [Key Features](#key-features)
* [Installation Options](#installation-options)
* [System Requirements](#system-requirements)
* [Quick Start Guide](#quick-start-guide)
* [Bug Reporting and Feedback](#bug-reporting-and-feedback)
* [License and Privacy](#license-and-privacy)

---

## Key Features

### Dynamic Server Browser
- Connects directly to global DayZ master lists and local servers.
- Displays real-time player counts, ping latency, time-of-day, active mods, maps, and password protection status.
- Automatically hides unreachable/offline servers to keep the list clean.
- Favorites system with real-time ping updates.

### Native Mod Manager
- **Workshop Validation**: Automatically checks server-required mods against your local Steam Workshop directory, highlighting missing or outdated mods *before* you connect.
- **Mod Loadouts**: Save, rename, and toggle custom mod configurations.
- Native Steam integration for one-click mod subscriptions.

### Proton and Wine Auto-Detection
- Automatically scans your Steam directories to detect installed Proton versions (Proton GE, Experimental, etc.).
- Launch DayZ with the best compatibility layer in one click.

### Performance Tuning and Game Optimization
- Inject optimal launch arguments with simple toggles: `-nosplash`, `-noPause`, `-limitFPS`, etc.
- Native **MangoHud** integration for real-time FPS and hardware monitoring.
- **Feral GameMode** and custom allocator support to maximize performance and prevent micro-stutters.

### Telemetry and Crash Diagnostics
- View launch logs, telemetry charts, and session summaries.
- Analyzes crash logs automatically and suggests actionable fixes.

### Custom Server Watchlist
- Track specific servers for player count thresholds and slot availability.
- Triggers native desktop notifications when your target rules are matched.

---

## Installation Options

If you prefer not to use the automated install script, you can manually download the binaries from our [Releases Page](https://github.com/dawiisss/DzLinux/releases/latest) and launch them using the instructions below.

### AppImage (Portable)
1. Download `DzLinux-1.3.4.AppImage`.
2. Make it executable:
   ```bash
   chmod +x DzLinux-1.3.4.AppImage
   ```
3. Run or double-click to launch.

### Portable Archive (tar.gz)
1. Download `dzlinux-1.3.4.tar.gz`.
2. Extract to your games directory:
   ```bash
   tar -xzf dzlinux-1.3.4.tar.gz -C ~/Games/
   ```
3. Run the binary:
   ```bash
   cd ~/Games/DzLinux
   ./dzlinux
   ```

### Debian Package (deb) - Ubuntu, Debian, Pop!_OS, Mint
1. Download `dzlinux_1.3.4_amd64.deb`.
2. Install via terminal:
   ```bash
   sudo dpkg -i dzlinux_1.3.4_amd64.deb
   sudo apt install -f
   ```

### RPM Package (rpm) - Fedora, RHEL, openSUSE
1. Download `dzlinux-1.3.4.x86_64.rpm`.
2. Install via terminal:
   ```bash
   sudo rpm -i dzlinux-1.3.4.x86_64.rpm
   ```

---

## System Requirements

| Dependency | Purpose | Status |
|---|---|---|
| **Steam client** | Game launching, Workshop mod management via native API | Required for full functionality |
| **Proton / GE-Proton** | Custom compatibility layer | Highly Recommended |
| **GameMode** (`gamemode`) | CPU governor optimization | Optional (Enhancement) |
| **MangoHud** (`mangohud`) | Performance overlay | Optional (Enhancement) |

Install performance dependencies:
```bash
# Ubuntu / Debian
sudo apt install gamemode mangohud

# Fedora
sudo dnf install gamemode mangohud
```

---

## Quick Start Guide

1. **Auto-Detection**: Launch DzLinux. Click the **Settings** icon to verify your DayZ paths. DzLinux auto-detects standard locations, but you can manually choose paths if installed on secondary drives.
2. **Select Proton**: Choose your preferred Proton version from the dropdown list.
3. **Toggle Optimizations**: Enable performance features (GameMode, MangoHud) based on your system.
4. **Connect**: Browse the Server Browser, choose a server (missing mods will be identified for syncing), and click **CONNECT** to play.

---

## Bug Reporting and Feedback

Report issues and suggest features on our [Issues Page](https://github.com/dawiisss/DzLinux/issues). Please include your Linux distribution, Proton version, Steam path configuration, and any crash log outputs.

---

## License and Privacy

- **License**: DzLinux is open-source software distributed under the [MIT License](LICENSE).
- **Privacy**: No telemetry, analytics, or personal data collection. All queries and settings remain entirely local on your machine.
- **Compliance**: Independent third-party tool not affiliated with or endorsed by Bohemia Interactive. DayZ is a trademark of Bohemia Interactive.
