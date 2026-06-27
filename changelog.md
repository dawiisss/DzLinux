# Changelog

All notable changes to the DzLinux launcher project will be documented in this file.

## [Unreleased]

## [1.3.0] - 2026-06-27

### Added
- **Configurable Background Query Concurrency**: Added a new setting to customize the number of parallel UDP queries during background ping sweeps (defaulted to `500` with a max limit of `1000`). Configurable via the settings panel and saved locally.
- **Hide Locked Filter**: Added a new "Hide Locked" filter button to replace the old "Hide Passworded" filter, along with renaming all corresponding internal state variables and handlers to align with standard gaming launcher terminology.
- **Inline SVG Icon System**: Replaced all character and emoji icons across the titlebar, search inputs, filter groups, telemetry headers, settings sections, favorites tables, context menus, and toast notifications with styled inline SVG icons. Swapped the rocket icons on the `DIRECT JOIN`, `QUICK LAUNCH`, and `LAUNCH PRESETS` components with clean Play SVGs; updated the `SYNC OUT-OF-DATE MODS` modal button to use Download/Loader SVGs; replaced the remaining emojis on the Mod Manager `SAVE`/`DELETE` buttons, Watchlist `REFRESH`/`DELETE` buttons, and the Server Table favorites header with crisp SVGs; and swapped the ping emoji (`📶`) on individual row `PING` buttons with a styled inline Signal SVG (using a Loader SVG spinner during active queries).

### Optimized
- **Memory & Disk Footprint of Server Cache**: Optimized `server_cache.json` serialization by stripping out transient fields (`id`, `originalIndex`) and properties with default or empty values before writing to disk. Values are dynamically re-hydrated on load.
  - *Result*: Reduced `server_cache.json` file size by **68%** (from **4.4MB to 1.4MB**), dramatically improving app startup parsing time and reducing IPC serialization overhead.
- **Debounced Query Port Cache I/O**: Replaced the sequential promise-chain file writing queue in `serverQuery.js` with a debounced/throttled saving mechanism. The query port cache file is now written at most once every second during background sweeps.
  - *Result*: Resolves memory accumulation leaks from long sequential promise queues and prevents write-contention/disk I/O bottlenecks.
- **Proactive Garbage Collection Constraints**: Appended V8 flags `--max-old-space-size=512` and `--optimize-for-size` to command-line parameters to restrict memory heap limits and force active GC cycles in background processes.
- **Asynchronous Mod Scanning**: Replaced all synchronous `fs.statSync`, `fs.existsSync`, `fs.readFileSync`, and `fs.rmSync` calls in `modManager.js` (including within `getInstalledMods`, `openModFolder`, `deleteMod`, and `checkModUpdates`) with their asynchronous `fs.promises` equivalents. This prevents blocking the Node.js event loop during mod operations.

### Fixed
- **OOM Crash on List Refresh**: Added abort condition support to `asyncPool` in `serverBrowserRender.js` to break the loop immediately if the query generation changes (e.g. when double-refreshing). This prevents allocating thousands of stale promises, resolving heap exhaustion and Out of Memory (OOM) crashes under high concurrency.
