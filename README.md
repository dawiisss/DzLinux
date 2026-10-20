# <img width="45" height="45" alt="icon" src="https://github.com/user-attachments/assets/7af6cc2e-344f-4047-9085-153c2b890d9c" /> DzLinux — DayZ Launcher, Server Browser and Mod Manager for Linux

[![GitHub tag (latest by date)](https://img.shields.io/github/v/tag/dawiisss/DzLinux?color=brightgreen&logo=github&label=release)](https://github.com/dawiisss/DzLinux/releases/latest)
[![Platform support](https://img.shields.io/badge/platform-Linux-orange?logo=linux)](https://github.com/dawiisss/DzLinux)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub Repo stars](https://img.shields.io/github/stars/dawiisss/DzLinux?style=social)](https://github.com/dawiisss/DzLinux/stargazers)

DzLinux is a high-performance, native launcher, server browser, and mod manager for playing **DayZ on Linux**. It features dynamic Proton version detection, real-time server querying via A2S, automatic Steam Workshop mod verification, performance tuning (MangoHud, GameMode), and native desktop watchlist notifications.

Play modded and vanilla DayZ on Linux with a zero-setup, optimized launcher.

Version **2.1.0** adds searchable, grouped Favorites, configurable Watchlist conditions with cancellable auto-join, and expandable connection history. See the [changelog](changelog.md#210---2026-10-20) for release notes.

<img width="1398" height="796" alt="DzLinux DayZ Server Browser and Mod Manager Interface on Linux" src="https://github.com/user-attachments/assets/8eeb2bd4-b6a2-4978-828e-16c671e88a52" />

---

## Quick Install

Run this command in your terminal to automatically detect your system and install the latest version (.deb, .rpm, or AppImage):

```bash
curl -sSL https://raw.githubusercontent.com/dawiisss/DzLinux/main/install.sh | bash
```

This command can also be used to update the version if you are using .deb / .rpm

---

## Table of Contents

* [Key Features](#key-features)
* [Installation Options](#installation-options)
* [System Requirements](#system-requirements)
* [Quick Start Guide](#quick-start-guide)
* [App Data and Logs](#app-data-and-logs)
* [Bug Reporting and Feedback](#bug-reporting-and-feedback)
* [License and Privacy](#license-and-privacy)

---

## Key Features

### Dynamic Server Browser
- Connects directly to our DayZ master list.
- Displays real-time player counts, ping latency, time-of-day, active mods, maps, and password protection status.
- **Advanced Filters**: Filter servers dynamically by Country, Map, Perspective (1pp/3pp), Category (Vanilla/Modded), and connection status.
- **Favorites Filter and Hide Favorites**: Pin favourite servers for quick access, or hide them from the main list to browse new servers more easily.
- **Virtual Scroll and Paging**: Switch between classic pagination and endless scrolling for large server lists.

### Server Trust Score and Security
- **Strict IP Verification**: Background engine automatically cross-references servers against an open-source JSON list of known, verified DayZ community IP addresses to prevent malicious servers from spoofing popular community names.
- **Heuristic Scoring**: Servers are dynamically assigned a Trust Score tier (Green, Yellow, or Gray shield) based on verified IPs, password protection, active moderation tools (CFTools/VPPAdmin), and high population heuristics.
- **Settings Toggle**: The Trust Score engine and background IP verifications can be globally disabled in the Settings menu to hide UI elements and save bandwidth.

### Native Mod Manager
- **Workshop Validation**: Automatically checks server-required mods against your local Steam Workshop directory, highlighting missing or outdated mods *before* you connect.
- **One-click Subscribe All**: Queue all missing mods for a server in a single click.
- **Dependency Tree Inspector**: Visualise the full mod dependency graph and identify missing transitive dependencies.
- **Mod Loadouts**: Save, rename, and toggle custom mod configurations.
- Native Steam integration for one-click mod subscriptions.

### Proton and Wine Auto-Detection
- Automatically scans your Steam directories to detect installed Proton versions (Proton GE, Experimental, etc.).
- **Multi-Library Steam Support**: Automatically locates DayZ installs and Workshop content across secondary Steam libraries defined in `libraryfolders.vdf`, supporting symlinked paths and multi-drive storage.
- Launch DayZ with the best compatibility layer in one click.
- **Native Wayland Support**: Toggle native Wayland flags (`PROTON_ENABLE_WAYLAND=1`) and Ozone platform flags directly from settings.

### Favorites
- **Find and Organize Servers**: Search saved servers by label, name, address or map; sort by saved order, name, fresh ping/population, or retained last use. Pin favorites above other matching results and organize them into optional groups. Long lists and expanded mod details remain scrollable.
- **Add by Address**: Paste IPv4/hostname addresses or bracketed IPv6, check a lightweight server preview, and save it. Unreachable servers can be saved explicitly with unknown measurements. Personal labels stay separate from the actual server name.
- **Honest Refresh Feedback**: Refresh all favorites or one server, see progress, cancel a batch, and keep clearly marked last-known values after failures. Unknown measurements are shown as unknown; Favorites has no periodic polling.
- **Shared Server Tools**: Keep expandable Workshop mod details, download totals and subscription controls. Manual mod refreshes stay synchronized across Favorites and Server Browser, with newer requests superseding older queries. Connect uses fresh mod requirements and checks cancellation immediately before launching. Failed mod queries remain marked unavailable. Watchlist status and Create/Edit watch actions use the existing Watchlist editor.
- **Safe Storage**: Favorites stay in settings.json with targeted main-process mutations. Migration preserves saved order, names and query ports, backs up only the old Favorites payload, and keeps previous saved names available for reuse as labels. Preference resets preserve favorites/groups; invalid collections are reported rather than silently emptied.

### Watchlist and Auto-Join System
- **Clear Watch Conditions**: Watch for at least a chosen number of free slots, a minimum population, or a server returning after two consecutive failed checks. Unknown population/capacity never counts as zero. An already-online server does not immediately trigger a back-online watch.
- **Monitoring Feedback**: See current watch-query results, last-check times, unreachable/stale data, pause/snooze state, and the next automatic check. Refresh queries watched servers immediately, including display-only checks for paused/snoozed entries. Long lists scroll, and consecutive outage checks remain valid across slow query cycles.
- **Alert Controls**: New watches alert once and pause. Keep watching rearms after a new qualifying episode with a 1-, 5-, or 15-minute cooldown; continuously matching conditions do not produce periodic reminders. Use Watch again, Snooze 15 minutes, or Wake now explicitly. Connect and its action menu stay aligned, with Watch again on a separate line.
- **Predictable Auto-Join**: Opt in per server and set priority (1 highest). One five-second countdown runs at a time, followed by a fresh condition check, fresh server mod requirements, and the existing installed/missing-mod workflow. Manual connections take precedence. A successful launch request suspends further automatic offers until Resume auto-join is selected; notifications continue.
- **Background Monitoring**: Main-process polling continues across tab changes and minimized windows while DzLinux runs. Automatic polling can be disabled separately; Refresh still evaluates eligible watches. Closing the application stops monitoring. Sleep/resume resets outage continuity and expires old countdowns.
- **Safe Migration**: Existing fixed player thresholds retain their exact semantics, including “at most N players”; they are not converted using guessed capacity. Migration saves the original array in watchlist.json.v1-backup. Failed/corrupt-file loads are surfaced without replacing the original with an empty watchlist.
- **Availability Limits**: Reported free slots do not reserve a place or expose game queue positions. “Unreachable” is a failed query from this client, not proof of server downtime. Desktop/in-app alerts are best effort; a crash between saving an alert latch and delivery can lose an alert.

### History and Recorded Activity
- **Recent Servers**: Find previously used servers with readable map names, relative dates, search, Most recent/Most used sorting, and last-use filters.
- **Join Again**: Requery the server's current mod requirements, check installed mods, and use the existing missing-mod sync flow before launching. A failed query stops the join rather than using stale requirements.
- **Expandable Activity**: Inspect timestamped connection attempts, recorded ping and population, and statistics for 24-hour, 7-day, and 30-day periods. These are observations recorded around Connect requests, not confirmed gameplay sessions or continuous monitoring.
- **Secondary Actions**: Add favorites, copy server addresses, or remove history through labeled action menus. Destructive actions require confirmation.
- **Local Retention**: History is stored in history.json with a 30-day policy, a 500-server cap, and up to 200 recent observations per server. Aggregate counts may exceed the retained observations. Pending History writes are completed during graceful shutdown.
- **Notes Removed**: Notes are no longer shown, searched, or editable. Existing stored note text is preserved during migration.

### Performance Tuning and Game Optimization
- Inject optimal launch arguments with simple toggles: `-nosplash`, `-noPause`, `-limitFPS`, etc.
- Native **MangoHud** integration for real-time FPS and hardware monitoring.
- **Feral GameMode** and custom allocator support to maximize performance and prevent micro-stutters.
- **DXVK** async shader compilation and thread control.

### Premium Customization and Layout Modes
- **Layout Selection**: Switch instantly between the traditional **Classic Navigation** and a sleek **Modern Sidebar Layout** with collapsible, pinnable navigation.
- **HUD Color Themes**: Includes 8+ curated color themes (including high-contrast dark profiles like *Tactical Dark*, *Vampire*, *Toxic*, *Cyberpunk*, *Forest Moss*, and clean light-mode themes like *Frostbite* and *Solar Sand*).

### System Compatibility and Crash Diagnostics
- **Built-in System Diagnostics**: On-demand compatibility audit verifying Steam installation status, Proton runtimes, disk space/permissions, Vulkan graphics, GameMode, and MangoHud.
- **Real-Time Crash Diagnostics**: Automatically monitors game exit events and parses DayZ crash logs in real time.
- Displays a crash summary modal with a description, log snippet, and suggested fix.
- One-click copy of the full diagnostic report to clipboard for easy sharing.

### Persistent Application Logging
- All runtime events, warnings, and errors are written to a persistent log file at `~/.config/dzlinux/logs/dzlinux.log`.
- Log entries older than 7 days are automatically pruned on startup.
- The log file location can be opened directly from the About screen.

---

## Installation Options

If you prefer not to use the automated install script, you can manually download the binaries from our [Releases Page](https://github.com/dawiisss/DzLinux/releases/latest) and launch them using the instructions below.

### AppImage (Portable)
1. Download `DzLinux-2.1.0.AppImage`.
2. Make it executable:
   ```bash
   chmod +x DzLinux-2.1.0.AppImage
   ```
3. Run or double-click to launch.

### Portable Archive (tar.gz)
1. Download `DzLinux-2.1.0-linux-x64.tar.gz`.
2. Extract to your games directory:
   ```bash
   tar -xzf DzLinux-2.1.0-linux-x64.tar.gz -C ~/Games/
   ```
3. Run the binary:
   ```bash
   cd ~/Games/DzLinux-2.1.0-linux-x64
   ./dzlinux
   ```

### Debian Package (deb) - Ubuntu, Debian, Pop!_OS, Mint
1. Download `dzlinux_2.1.0_amd64.deb`.
2. Install via terminal:
   ```bash
   sudo dpkg -i dzlinux_2.1.0_amd64.deb
   sudo apt install -f
   ```

### RPM Package (rpm) - Fedora, RHEL, openSUSE
1. Download `dzlinux-2.1.0.x86_64.rpm`.
2. Install via terminal:
   ```bash
   sudo rpm -i dzlinux-2.1.0.x86_64.rpm
   ```

### Arch Linux (PKGBUILD)
1. Clone or download `build/PKGBUILD`.
2. Build and install with `makepkg`:
   ```bash
   makepkg -si
   ```

---

## System Requirements

| Dependency | Purpose | Status |
|---|---|---|
| **Steam client** | Game launching, Workshop mod management via native API | Required for full functionality |
| **xdg-utils** (`xdg-utils`) | Opening external links, file managers, and desktop integration | Required |
| **Proton / GE-Proton** | Custom compatibility layer | Highly Recommended |
| **GameMode** (`gamemode`) | CPU governor optimization | Optional (Enhancement) |
| **MangoHud** (`mangohud`) | Performance overlay | Optional (Enhancement) |

Install required and performance dependencies:
```bash
# Ubuntu / Debian
sudo apt install xdg-utils gamemode mangohud

# Fedora
sudo dnf install xdg-utils gamemode mangohud
```

---

## Quick Start Guide

1. **Auto-Detection**: Launch DzLinux. Click the **Settings** icon to verify your DayZ paths. DzLinux auto-detects standard Steam library locations, but you can manually set paths if DayZ is installed on a secondary drive.
2. **Select Proton**: Choose your preferred Proton version from the dropdown list.
3. **Toggle Optimizations**: Enable performance features (GameMode, MangoHud, DXVK async) based on your system.
4. **Connect**: Browse the Server Browser, choose a server (missing mods will be identified for syncing), and click **Connect** to play.

---

## App Data and Logs

DzLinux stores all user data locally at:

```
~/.config/dzlinux/
```

| File | Contents |
|---|---|
| `settings.json` | All user settings |
| `favorites-v1-backup.json` | Original Favorites payload retained during migration |
| `watchlist.json` | Watchlist items |
| `history.json` | Server connection history, attempt counts and population snapshots |
| `server_cache.json` | Cached server list (5-minute TTL) |
| `custom_servers.json` | Manually added custom servers |
| `query_port_cache.json` | Cached A2S query ports (30-day TTL) |
| `monetization_cache.json` | Bohemia monetization approved list (24-hour TTL) |
| `verified_ips_cache.json` | Verified community IPs list (24-hour TTL) |
| `mods_metadata_cache.json` | Per-server mod lists from A2S queries (24-hour TTL) |
| `logs/dzlinux.log` | Application log file (7-day rolling retention) |

No data is ever sent to external servers. All queries and settings remain entirely local on your machine.

---

## Bug Reporting and Feedback

Report issues and suggest features on our [Issues Page](https://github.com/dawiisss/DzLinux/issues). Please include your Linux distribution, Proton version, Steam path configuration, and any relevant entries from `~/.config/dzlinux/logs/dzlinux.log`.

---

## License and Privacy

- **License**: DzLinux is open-source software distributed under the [MIT License](LICENSE).
- **Privacy**: No telemetry, analytics, or personal data collection. All queries and settings remain entirely local on your machine.
- **Compliance**: Independent third-party tool not affiliated with or endorsed by Bohemia Interactive. DayZ is a trademark of Bohemia Interactive.
