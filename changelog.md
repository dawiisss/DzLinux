# Changelog

All notable changes to the DzLinux launcher project will be documented in this file.

## [Unreleased]

## [1.4.1] - 2026-07-05

### Changed

- **Platform Stack Upgrade**: Upgraded `electron` to `^43.0.0` and `electron-builder` to `^26.15.3`. This updates the internal stack (Chromium 150, Node.js v24.17.0, V8 15), improves native event emission/IPC dispatch performance, and enables rounded corners by default for frameless windows on Linux.
- **UI Casing Improvements**: Converted additional user-facing UI labels and buttons (such as the update download actions) from all-uppercase to standard title/sentence casing.

### Security

- **Vulnerability Remediation**: Natively resolved high and moderate severity security vulnerabilities in transitive dependencies (`undici` and `js-yaml`) through the platform upgrades.

## [1.4.0] - 2026-07-02

### Added

- **Modern Left-Hand Sidebar Layout**: Designed and implemented a left navigation sidebar containing tab items, Steam profile status card, and a pin toggle, switchable from settings (this is the default for new installs from now on).
- **Titlebar Brand Icon**: Added the application brand icon next to the titlebar text for enhanced styling.
- **New HUD Color Themes**: Introduced five new rich color schemes: Frostbite (Light Ice Blue), Solar Sand (Light Warm Gold), Cyberpunk (Neon Pink/Cyan), Forest Moss (Deep Green), and Classic (Tactical Red accent on standard dark background).
- **Background Color Shifting**: Changed background styling in CSS to support dynamic color shifting, background-glow transitions, and theme-compliant light/dark mode text input variables. Upgraded all original dark themes (Toxic, Amber, Deep Sea, Vampire) to feature subtle, color-tinted background shifts.
- **Pre-commit Hook Automation**: Configured Husky and lint-staged to run automatic linter checks and test validation before every commit.
- **Comprehensive Test Coverage**: Added robust unit and integration tests across the codebase, targeting exposed Electron preloads (`preload.test.js`), Steam path discovery (`steamPaths.test.js`), and worker message channel lifecycle management (`steamworksManager.test.js`), achieving over 60% test coverage.
- **GitHub Actions CI Workflow**: Set up a consolidated workflow to automatically validate dependencies, lint syntax, and run tests on every push/pull request.
- **IPC Input Validation**: Implemented strict validation checks for server IP addresses and port numbers on all Electron IPC handler endpoints.
- **Path Traversal Protection**: Restructured path-checking operations to restrict files to allowed Steam and system directories.
- **About Modal GitHub Link**: Added a link to the project's main GitHub repository page within the About modal.
- **Persistent File Logging**: Console output (log, warn, error) is now written to a persistent timestamped log file under the application data directory (`logs/dzlinux.log`). Log entries older than 7 days are automatically pruned on startup (This should make it much easier for users to raise issues).
- **View Application Logs Link**: Added a "View application logs" link in the About modal that opens the log file location in the system file manager.

### Changed

- **Titlebar Title Simplification**: Renamed the titlebar heading from "DzLinux SERVER BROWSER" to a clean "DzLinux".
- **Redundant Headers Removal**: Removed duplicate brand names and version badges from both classic top-header and modern sidebar menus.
- **Classic Navigation Layout Expansion**: Redesigned the top navigation header in classic view to expand tabs horizontally across the header using a 1fr auto grid, utilizing the reclaimed brand logo space.
- **Settings Panel Reorganization**: Repositioned Display Mode below Layout Mode in the Appearance tab, and moved Background Query Concurrency into the Network Polling card.
- **Factory Default settings adjustments**: Configured Compact display mode and disabled Auto-refresh by default on fresh installations. Added automated Steam Workshop mod directory path auto-discovery scanning whenever settings are reset to factory defaults.
- **Top Header Gradient & Shadow Removal**: Removed the hardcoded dark gradient and heavy box-shadow from the top menu bar, replacing it with a theme-compliant panel background variable.
- **Unified Theme Compliance**: Refactored the modern layout sidebar (making the expanded/collapsed pinned state persistent across application sessions), table pagination bar (adding 20px of padding to the left/right to keep page count text off the border), diagnostics console boxes, toast notifications (making text colors dynamic and removing the heavy left green border for flat borders), workshop download status logs, footer status bar, filter dropdown popups (e.g. Map, Slots, Ping, Sort), Local Workshop Storage header, and watchlist threshold slider track to adapt color palettes, text contrast, and background opacity dynamically based on the active HUD theme.
- **Expanded Row Background Cleaning**: Replaced the hardcoded grey background overlay from the expanded server details rows with transparent backgrounds to match selected HUD theme color schemes seamlessly.
- **Background Shadow Removal**: Removed hardcoded inset and dark background box-shadows on `.table-card`, `.settings-card`, diagnostics crash cards, and the modern sidebar during hover/expand actions, replacing them with a flat design style or soft, theme-compliant 5% opacity card shadows to clean up the user interface under light modes.
- **CSP Hardening**: Hardened the renderer Content Security Policy by completely removing `'unsafe-inline'` from the `script-src` directive.
- **Dynamic Event Listeners**: Refactored all inline HTML event handlers (`onclick` and `onchange`) into dynamic listeners inside the UI controller script, preventing global window namespace pollution.
- **serverRow Monolith Decomposition**: Refactored the long `buildServerRow` monolith into small, maintainable helper functions (`createRowSkeleton`, `buildStarCell`, `buildPingCell`, and `buildActionCell`).
- **Keyboard and Screen Reader Accessibility**: Enhanced user interface accessibility by adding tab indexing, button roles, and Enter/Space event handlers to copy IP tags, and dynamically updating standard `aria-pressed` attributes on toggle inputs.
- **In-Memory Settings and Watchlist Caching**: Improved settings and watchlist lookup performance by caching records in memory and converting all synchronous file writes to non-blocking asynchronous operations.
- **Standardized Require Scheme**: Prefixed all native Node.js requires with the standard `node:` scheme across all backend source files.
- **Casing Changes**: Rewrote all-uppercase copy in toast notifications, button states, and context menu actions to use standard title/sentence casing.
- **Ping Parsing De-duplication**: Extracted duplicate GameDig ping mapping routines into a centralized `applyPingResult` helper.
- **SVG Icon Standardization**: Replaced text/emoji-based pseudo-elements and button labels (`📋`, `🌐`, `⬇️`) with native SVG icons from the central icon registry component.
- **Modal Header SVG Icons**: Added contextual SVG icons to all modal headers (Server Mods Checklist, Direct Join, Update Available, Confirm Action) using the centralized `<app-icon>` component.
- **Mod Status Label Simplification**: Shortened the local mod installed status label in the server row mod list from `✓ READY` to a clean checkmark (`✓`).
- **Filter Bar Highlight Removal**: Removed the left-side accent glow effect from the server browser filter options bar for a cleaner appearance.
- **Diagnostics Section Glow Removal**: Removed the left-side accent glow effect from the diagnostics panel for a cleaner appearance.

### Fixed

- **Modern Sidebar z-index Overlay**: Increased sidebar z-index to overlay the bottom status bar and footer correctly when expanded.
- **Server Merge Index Corruption**: Resolved index conflicts when merging duplicate custom and hosted servers during parsing.
- **Steamworks Launch Lock De-duplication**: Consolidated duplicate launch timer delay and unlock hooks inside a reusable `lockAndDelayForLaunch` routine.
- **Server Portal Thread Safety**: Secured server repository writes against concurrent registration conflicts using a promise-based mutex queue.
- **Steam Workshop Mod Page Navigation**: Fixed the mod list interaction so clicking a numeric Workshop ID directly launches the Steam Community Workshop page in the client.
- **Disk Capacity Telemetry**: Fixed the mod manager storage allocation graph displaying "Unknown disk capacity" when the workshop mod path was not yet resolved.

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
