# <img width="45" height="45" alt="icon" src="https://github.com/user-attachments/assets/7af6cc2e-344f-4047-9085-153c2b890d9c" /> DzLinux — DayZ Server Browser, Mod Manager and Launcher for Linux

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/dawiisss/DzLinux?color=brightgreen&logo=github)](https://github.com/dawiisss/DzLinux/releases/latest)
[![Platform support](https://img.shields.io/badge/platform-Linux-orange?logo=linux)](https://github.com/dawiisss/DzLinux)

Welcome to the official public repository for **DzLinux**! 

**DzLinux** is a premium, high-performance, native **DayZ Server Browser**, **Mod Manager**, and **Launcher** designed specifically for playing **DayZ on Linux**. By combining a hardware-accelerated military-grade Tactical HUD with deep Steam and Proton integration, DzLinux helps you manage your mod loadouts and join servers seamlessly on Linux. If you want to play DayZ on Linux, download our pre-compiled packages below.

> [!NOTE]
> This repository contains the official open-source codebase for **DzLinux**, including the launcher, server browser, and build automation setups. Compiled distribution binaries and release assets are hosted directly on the public Releases page.

<img width="1397" height="799" alt="v131" src="https://github.com/user-attachments/assets/935d14ce-414c-48a8-8ddb-3e2f5d84819e" />

---

## Table of Contents
* [Key Features](#key-features)
* [Installation and Setup](#installation-and-setup)
* [Configuration Guide](#configuration-guide)
* [Bug Reporting and Feedback](#bug-reporting-and-feedback)
* [License and Compliance](#license-and-compliance)

---

## Key Features

### GUI Interface
Experience a beautifully styled, high-contrast user interface designed to be practical.

### Proton and Wine Auto-Detection
No more guessing paths or writing bash wrappers. DzLinux automatically scans your local Steam directories and user libraries to detect installed Proton versions (including Proton GE and Experimental), letting you launch the game seamlessly with the optimal compatibility layer in one click.

### Smart A2S Server Querying
Connect directly to global DayZ aggregators and local servers. Retrieve real-time player counts, server latency, time-of-day cycles, active mods, and specific server rule flags instantly. Add your favorite servers to a custom list for instant redeployment.

### Telemetry and Crash Diagnostics
Review detailed telemetry summaries and launcher launch logs. Instantly analyze recent session logs, connection drop counts, and view helpful, actionable suggested fixes for game crashes.

### Custom Server Watchlist
Add servers to a personal watchlist to track slots availability and target population thresholds. Get real-time native desktop notifications when your rules match.

### Mod Management
* **Workshop Validation:** Automatically cross-references a target server's required mods list against your local Steam Workshop directory, highlighting missing or outdated mods *before* you attempt to join.
* **Mod Loadouts:** Create, save, and toggle named loadouts of your local mods.

### One-Click Performance Optimizations
Inject advanced launch arguments directly through a simple toggle interface:
- **Game Engine Toggles:** `-nosplash`, `-noPause`, `-limitFPS`, `-window`, and more.
- **Overlay Support:** Instantly hook **MangoHud** for real-time framerate and system metrics.
- **System Optimizations:** Enable **Feral GameMode** and custom memory allocators to maximize client performance and prevent Linux micro-stutters.

---

## Installation and Setup

DzLinux requires no installation and is fully portable. You can use our automated install script, or manually download your preferred distribution format from our [Releases Page](https://github.com/dawiisss/DzLinux/releases).

### Method 1: Automated Install Script (Recommended)
The easiest way to install DzLinux is using our automated install script. It will detect your Linux distribution and automatically download and install the correct format (.deb, .rpm, or AppImage) for your system.

Run the following command in your terminal:
```bash
curl -sSL https://raw.githubusercontent.com/dawiisss/DzLinux/main/install.sh | bash
```

### Method 2: AppImage (Portable)
The AppImage format is a single, self-contained executable that runs on almost any modern Linux distribution (Ubuntu, Fedora, Arch, Debian, etc.).

1. Head to the [Releases Page](https://github.com/dawiisss/DzLinux/releases/latest) and download `DzLinux-1.3.2.AppImage`.
2. Give the file executable permissions via your terminal:
   ```bash
   chmod +x DzLinux-1.3.2.AppImage
   ```
   *(Or right-click the file in your file manager, open **Properties** -> **Permissions**, and check **Allow executing file as program**).*
3. Double-click the file to launch the app.

We recommend using Gear Lever or any other AppImage management app.

### Method 3: Portable Archive (.tar.gz)
If you prefer standard directory structures or like to keep your game utilities in a dedicated folder (e.g., `~/Games/`):

1. Download `dzlinux-1.3.2.tar.gz` from the [Releases Page](https://github.com/dawiisss/DzLinux/releases/latest).
2. Extract the archive:
   ```bash
   tar -xzf dzlinux-1.3.2.tar.gz -C ~/Games/
   ```
3. Navigate to the extracted folder and run the binary:
   ```bash
   cd ~/Games/DzLinux
   ./dzlinux
   ```

### Method 4: Debian Package (.deb) — Ubuntu, Debian, Pop!_OS, Mint

1. Download `dzlinux_1.3.2_amd64.deb` from the [Releases Page](https://github.com/dawiisss/DzLinux/releases/latest).
2. Install via the terminal:
   ```bash
   sudo dpkg -i dzlinux_1.3.2_amd64.deb
   sudo apt install -f
   ```
   *(Or double-click the .deb file in your file manager to open with your package installer.)*
3. Launch from your app menu or run `dzlinux` in the terminal.

### Method 5: RPM Package (.rpm) — Fedora, RHEL, openSUSE

1. Download `dzlinux-1.3.2.x86_64.rpm` from the [Releases Page](https://github.com/dawiisss/DzLinux/releases/latest).
2. Install via the terminal:
   ```bash
   sudo rpm -i dzlinux-1.3.2.x86_64.rpm
   ```
3. Launch from your app menu or run `dzlinux` in the terminal.

### Updates

- **AppImage** — The built-in auto-updater handles downloads and installs automatically.
- **tar.gz / .deb / .rpm** — Updates are manual. The app will notify you when a new version is available with a link to the [Releases page](https://github.com/dawiisss/DzLinux/releases/latest). Re-download the package for your format and install it to update.

---

## Requirements

The application will launch without any of these installed, but certain features will be unavailable if the corresponding dependency is missing.

### Required for full functionality
| Dependency | Purpose | Effect if missing |
|---|---|---|
| **Steam client** | Game launching, Workshop mod management via native API | Launching via "Steam Default" method fails; Proton direct mode still works |
| `ping` (iputils) | Server latency measurement via ICMP | Servers display "TIMEOUT" instead of ping ms until GameDig responds |

### Optional enhancements
| Dependency | Purpose |
|---|---|
| **GameMode** (`gamemode`) | CPU governor optimization at game launch |
| **MangoHud** (`mangohud`) | On-screen performance overlay (fps, temps, RAM) |
| **Proton / GE-Proton** | Custom Proton launch mode (auto-detected from Steam if installed) |

Install optional dependencies via your package manager:
```bash
# Ubuntu / Debian
sudo apt install gamemode mangohud

# Fedora
sudo dnf install gamemode mangohud
```

---

## Configuration Guide

1. **Set Paths:** On your first launch, click the **Settings** gear icon. DzLinux will attempt to auto-detect your Steam library and DayZ Workshop folders. If they are installed on a secondary drive, manually browse and select your standard `steamapps/common/DayZ` and `steamapps/workshop/content/221100` directories.
2. **Choose Proton:** Select your preferred Proton version from the auto-detected dropdown list.
3. **Customize Arguments:** Toggle performance arguments (GameMode, MangoHud, nosplash) based on your system configuration.
4. **Connect:** Browse the Server Browser, choose a server, let the mod manager verify your mods, and click **LAUNCH** to deploy.

---

## Bug Reporting and Feedback

We rely on community feedback in this repository to find and squash bugs!

### How to open an issue:
1. Go to the [Issues Page](https://github.com/dawiisss/DzLinux/issues).
2. Click **New Issue** and select the appropriate template (Bug Report or Feature Request).
3. Include your Linux distribution, Proton version, Steam library path setup, and any log outputs or screenshots showing the issue.

### Contributing Feature Requests:
Have an idea for a performance toggle, layout improvement, or mod-management feature? Please feel free to open a ticket! We actively monitor the issues tracker to prioritize community-requested features.

---

## License and Compliance

* **Application License:** DzLinux is open-source software licensed under the [MIT License](LICENSE).
* **Privacy & Telemetry:** DzLinux does not collect, store, or transmit any personal data, analytics, or telemetry. All server queries are done directly from your machine to the public game databases, and your configuration settings remain completely local.
* **Open Source Acknowledgments:** DzLinux is built on top of incredible open-source libraries (including Electron, Axios, GameDig, and Steamworks.js). A full list of dependencies, their licenses, and source repositories can be found inside the application's **About / Info** pop-up or in the bundled `acknowledgments.txt` file distributed with every release package.

---

*DayZ is a registered trademark of Bohemia Interactive. DzLinux is an independent third-party tool and is not affiliated with or endorsed by Bohemia Interactive.*
