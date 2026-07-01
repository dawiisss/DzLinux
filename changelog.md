# Changelog

All notable changes to the DzLinux launcher project will be documented in this file.

## [Unreleased]

## [1.3.4] - 2026-07-01

### Changed

- **Dynamic Server Name Updating**: Server names are now retrieved and updated dynamically in real-time when the client pings/queries each server using GameDig, rather than relying on the static cached/hosted JSON server list names.
- **Offline Server Filtering**: Unconditionally filter out servers that fail to query (offline/timed-out servers) from the main server browser list, ensuring only active, reachable servers are displayed.
- **Verbose Log Cleanup**: Disabled verbose eviction logging from `queryPortCache` when stale ports fail to respond.

### Removed

- **Redundant Timeout Filter**: Removed the now-redundant `HIDE TIMEOUTS` button from the HTML, as well as its associated state flags, UI behavior handlers, and window bindings.

## [1.3.3] - 2026-06-29

### Fixed

- **Fedora/GNOME Start Menu Icon**: Fixed an issue where the launcher icon remained blank on Fedora and other GTK/GNOME desktop environments after installation/upgrade. Aligned the packaging desktop name configuration to lowercase `dzlinux` and added a `gtk-update-icon-cache` cache flush trigger to `install.sh`.

## [1.3.2] - 2026-06-29

### Fixed

- **System Package Update Prompts**: Fixed a bug where system-managed packages (Flatpaks, .deb, and .rpm installs under /usr or /opt) would unconditionally trigger false update prompts on startup. The client now verifies version metadata against GitHub releases before warning that an update is available.
- **Desktop Launcher and Menu Icon**: Fixed the app launcher icon not showing up in standard Linux desktop environments (like Ubuntu/GNOME applications menu). Generated a complete set of standard-sized icons under `build/icons/` and aligned the desktop launcher name (`dzlinux.desktop`), `StartupWMClass` (`DzLinux`), and the runtime Electron desktop identifier (`dzlinux`).

## [1.3.1] - 2026-06-29

### Added

- **Dynamic Password Status Checking**: Server password-protected status is now checked live on the client side via the GameDig ping response (`statusObj.password`) rather than being stored in the static hosted server list.
- **Dynamic Metadata Badges Refresh**: Added support to refresh metadata badge cells in real-time when manual or background pings finish.

### Fixed

- **Theme-Independent Medium Tier Colors**: Shifted the medium ping badge (`.ping-badge.ping-ok`) and the medium player count badge (`.player-badge.medium`) to use static orange colors (`--accent-orange`) instead of theme-dependent colors to prevent them from colliding with green/red status states when switching custom themes.

## [1.3.0] - 2026-06-27

### Added

- **Configurable Background Query Concurrency**: Added a new setting to customize the number of parallel UDP queries during background ping sweeps (defaulted to `500` with a max limit of `1000`). Configurable via the settings panel and saved locally.
- **Hide Locked Filter**: Added a new "Hide Locked" filter button to replace the old "Hide Passworded" filter, along with renaming all corresponding internal state variables and handlers to align with standard gaming launcher terminology.
- **Inline SVG Icon System**: Replaced all character and emoji icons across the titlebar, search inputs, filter groups, telemetry headers, settings sections, favorites tables, context menus, and toast notifications with styled inline SVG icons. Swapped the rocket icons on the `DIRECT JOIN`, `QUICK LAUNCH`, and `LAUNCH PRESETS` components with clean Play SVGs; updated the `SYNC OUT-OF-DATE MODS` modal button to use Download/Loader SVGs; replaced the remaining emojis on the Mod Manager `SAVE`/`DELETE` buttons, Watchlist `REFRESH`/`DELETE` buttons, and the Server Table favorites header with crisp SVGs; and swapped the ping emoji (`📶`) on individual row `PING` buttons with a styled inline Signal SVG (using a Loader SVG spinner during active queries).

### Optimized

- **Memory & Disk Footprint of Server Cache**: Optimized `server_cache.json` serialization by stripping out transient fields (`id`, `originalIndex`) and properties with default or empty values before writing to disk. Values are dynamically re-hydrated on load.
  - _Result_: Reduced `server_cache.json` file size by **68%** (from **4.4MB to 1.4MB**), dramatically improving app startup parsing time and reducing IPC serialization overhead.
- **Debounced Query Port Cache I/O**: Replaced the sequential promise-chain file writing queue in `serverQuery.js` with a debounced/throttled saving mechanism. The query port cache file is now written at most once every second during background sweeps.
  - _Result_: Resolves memory accumulation leaks from long sequential promise queues and prevents write-contention/disk I/O bottlenecks.
- **Proactive Garbage Collection Constraints**: Appended V8 flags `--max-old-space-size=512` and `--optimize-for-size` to command-line parameters to restrict memory heap limits and force active GC cycles in background processes.
- **Asynchronous Mod Scanning**: Replaced all synchronous `fs.statSync`, `fs.existsSync`, `fs.readFileSync`, and `fs.rmSync` calls in `modManager.js` (including within `getInstalledMods`, `openModFolder`, `deleteMod`, and `checkModUpdates`) with their asynchronous `fs.promises` equivalents. This prevents blocking the Node.js event loop during mod operations.

### Fixed

- **OOM Crash on List Refresh**: Added abort condition support to `asyncPool` in `serverBrowserRender.js` to break the loop immediately if the query generation changes (e.g. when double-refreshing). This prevents allocating thousands of stale promises, resolving heap exhaustion and Out of Memory (OOM) crashes under high concurrency.
