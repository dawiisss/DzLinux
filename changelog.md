# Changelog

All notable changes to the DzLinux launcher project will be documented in this file.

## [Unreleased]

### Added

### Changed

### Fixed

## [1.8.0] - 2026-08-18

### Added

- **Synchronous Settings Loader:** Added and exported a synchronous `loadSettings()` helper in `settings.js` specifically for early startup flag initialization prior to `app.whenReady()`.
- **Async Steam Path Unit Tests:** Added dedicated unit test coverage for `getSteamInstallPathAsync()` and `findDayzWorkshopFolderAsync()` in `steamPaths.test.js`.
- **Workshop URL Opener Unit Tests:** Added unit test coverage for `openWorkshopPage()` verifying URL parameter sanitization and Electron shell opening in `game.test.js`.
- **Launch Port and Settings Unit Tests:** Added unit tests verifying defensive port defaulting in `game.test.js` and synchronous `loadSettings()` in `settings.test.js`.

### Changed

- **Proton Launch Process Spawn:** Replaced `child_process.execFile` with `spawn` using `stdio: "ignore"` in `launchProton.js` to avoid `maxBuffer` memory limits and prevent unexpected process termination during long DayZ gameplay sessions.
- **Dependency Cache Memory Bounds:** Capped the Steam Workshop dependency resolver cache at 1,000 entries with bulk eviction to 90% capacity in `steamDependencyResolver.js` to prevent unbounded memory growth and reduce churn at the boundary.
- **Direct Toast Icon Identifiers:** Standardized `showToast()` calls across `serverRow.js` and `modManager.js` to pass clean icon name strings (`"star"`, `"download"`) rather than raw SVG constants or HTML elements.
- **UI Copy Casing Standardization:** Converted hardcoded uppercase button and label text (`Refresh`, `Servers:`, `Players:`, `Filtered:`) in `index.html`, reset dialog text in `settings.js` (`cannot`), and dependency error tags in `modManager.js` (`[Error: ...]`).
- **Early Wayland Ozone Bootstrap:** Moved Chromium command-line switch configuration (`UseOzonePlatform`, `ozone-platform=wayland`) in `main.js` to execute prior to `app.whenReady()`, ensuring Chromium activates native Wayland Ozone mode during initial process bootstrap.
- **External URL Opener Standardization:** Replaced `child_process.execFile("xdg-open")` in `openWorkshopPage()` with Electron's `shell.openExternal(url)` for robust sandbox/Flatpak compatibility and error propagation.
- **Table Colspan Consistency:** Aligned table skeleton loading placeholders and empty-state rows across `index.html`, `serverBrowserRender.js`, and `favorites.js` to `colspan="9"` to maintain visual alignment with the 9-column Security/Trust layout.
- **Preload API Cleanliness:** Removed orphaned `onComplete` IPC channel and listener references from `preload.js`.
- **Markdown Heading Anchor Hygiene:** Replaced literal ampersands (`&`) with `and` in markdown headings across all repository documentation.
- **Sync Filesystem Deprecation Notices:** Annotated legacy synchronous filesystem methods `getSteamInstallPath()` and `findDayzWorkshopFolder()` in `steamPaths.js` with JSDoc `@deprecated` warnings directing callers to async equivalents (`Rule 13`).
- **Build Utility Import Hygiene:** Removed unused `_path` import from `scripts/lib/utils.js`.
- **Centralized `existsAsync` Utility:** Consolidated the duplicate `existsAsync` helper (previously defined locally in `steamPaths.js`, `game.js`, and `launchProton.js`) into the shared `fileUtils.js` module.
- **Synchronous Settings Loader Documentation:** Added JSDoc to `loadSettings()` in `settings.js` explicitly documenting it as a startup-only constraint required for pre-ready Chromium command-line switch initialization.
- **Server Pipeline Step Numbering:** Fixed step comment numbering gap (4→6) in `servers.js` `fetchDayZServers` to be sequential.

### Fixed

- **Test Environment Variable Teardown:** Wrapped `process.env.TEST_VAR` test manipulation in `prepareEnv.test.js` with a `try ... finally` block to guarantee environment restoration on assertion failures (`Rule 8`).
- **Early Wayland Settings Load Error:** Fixed a startup `TypeError: settingsManager.loadSettings is not a function` in `main.js` which caused Wayland flags to fail silently.
- **Game Launch Missing Port Exception:** Fixed a potential `TypeError` in `launchDayZ` and `launchViaSteam` when `port` argument is missing or non-string by safely defaulting to `"2302"`.
- **History Favorite Port Mapping:** Fixed a bug where adding a favorite directly from the Connection History view assigned the game port as the A2S query port instead of preserving `queryPort`.
- **Gitignore Cleanliness:** Removed obsolete `server-portal/` entry from `.gitignore`.
- **UI Label Casing:** Changed hardcoded uppercase `ACTIVE LINK:` label in the Steam profile header to title case `Active Link:`.
- **Mod Manager IPC Error Propagation:** Added `.catch()` handlers with toast error feedback to fire-and-forget IPC calls (`openWorkshop`, `openFolder`, `subscribe` fallback) in `modManager.js` so failures are surfaced to the user instead of silently swallowed.

## [1.7.0] - 2026-08-11

### Added

- **Server Trust Score System:** Implemented a new heuristic-based trust scoring engine (`trustScore.js`) that analyzes DayZ servers to calculate a security rating. Verified communities, active moderation tools, high population counts, and password protection all contribute to the final tier calculation.
- **Strict IP Verification:** Built a background fetching system that downloads, parses, and caches (`24h` TTL) an open-source JSON list (`verified_ips.json`) of known, verified DayZ community server IPs and ports from GitHub. Servers matching this strict criteria receive an immense Trust Score boost and custom tooltip recognition, preventing malicious servers from spoofing popular names.
- **Trust Score UI Integration:** Added a new Security/Trust column to both the Server Browser and Favorites tables. Servers display dynamically colored shields (Green for High Trust, Yellow for Modded/Moderated, Gray for Unverified) based on their evaluated score.
- **Settings Toggle:** Added an *"Enable Trust Score Indicators"* toggle in the Appearance & Audio settings. Disabling this toggle instantly removes the security columns globally and suppresses the background network polling for the verified IPs list to save bandwidth.
- **Path Guard Security Tests:** Added a comprehensive 16-test unit test suite for `pathGuard.js`, covering allowed path validation, path traversal attack rejection, non-string input handling, dynamic mod directory inclusion from settings, and graceful fallback when settings fail to load.

### Changed

- **Watchlist Performance:** Optimized server lookups in background polling and UI rendering from $O(N)$ nested `.find()` iterations to $O(1)$ Map lookups, ensuring stable UI performance regardless of the master server list size.
- **Toast Icon Identifier Cleanup:** Replaced raw `<app-icon>` HTML strings and SVG constants passed to `showToast()` with direct icon name identifiers (`"trash"`, `"cube"`, `"info"`, `"eye"`) across `watchlist.js`, `serverRow.js`, and `contextMenu.js`. The `showToast()` function already auto-wraps icon names natively.
- **UI Casing Compliance:** Converted hardcoded uppercase filter labels (`PERSPECTIVE:`, `CATEGORY:`, `MAP:`, `COUNTRY:`, `SHORTLISTS:`, `CONNECTION:`) in `index.html` to sentence case. The CSS class `.filter-label` already applies `text-transform: uppercase` for visual rendering. Also changed uppercase UI copy (`"MISMATCH"`, `"UPDATE ALL"`) in `logParser.js` suggested fix text to title case (`"Mismatch"`, `"Update All"`).

### Fixed

- **Server UI Data Streaming:** Fixed a race condition where the backend process streamed the initial server batch to the UI *before* background async checks (Monetization & Verified IPs) finished processing. This caused hit-or-miss tag rendering on the first launch. The pipeline now waits until the servers are fully enriched before streaming to the frontend.
- **DOM Recycler Stale Data:** Fixed an issue in the server list DOM recycler where `tdSecurity` cells (Trust Score shields) and `tdMonetization` were completely ignored during row recycling. The renderer now dynamically evaluates state changes on the fly and updates shields dynamically without needing an app restart.
- **Favorites Ping Worker Abort:** Added a generation-based cancellation mechanism to the favorites ping worker pool. Rapidly clicking the refresh button now aborts any stale worker loops from a previous run, preventing background query accumulation and potential memory growth.
- **Bohemia Monetization Fetching:** Fixed an issue where the Bohemia monetization scraper broke due to layout changes on the official website. The app now fetches an open-source JSON list (`monetized_ips.json`) directly from the DzLinux GitHub repository, falling back gracefully to the legacy archived Bohemia page (`old.bohemia.net`) if the CDN is unreachable.
- **Cache Tag Persistence:** Fixed a bug in the disk serializer (`server_cache.json`) where it failed to save the `verifiedCommunity` attribute. This caused Verified Server shields to disappear on app re-launches occurring inside the 5-minute cache window.

### Security

- **Path Guard Prefix Boundary Vulnerability:** Fixed a directory traversal vulnerability where the IPC path guard's `startsWith()` check lacked a path-separator boundary check. This previously allowed paths sharing a string prefix (like `/optional-evil/payload` bypassing an `/opt` check) to be incorrectly allowed. The check now strictly enforces boundary separation or exact matching.

## [1.6.0] - 2026-08-06

### Added

- **Server Connection History & Analytics:** Added a dedicated Connection History & Analytics tab that records server joins, displaying server name, map, last connected time, session count, last ping, and custom server notes. History data is persisted in a standalone `history.json` file with automatic 30-day retention pruning and a 500-record cap. Legacy history entries from `settings.json` are automatically migrated on first load.
- **Server Connection Analytics Modal:** Built an interactive analytics modal powered by Chart.js for each history entry. Displays player count and ping recorded during your connection sessions over selectable 24h, 7d, and 30d timeframes, aggregate stats (total sessions, average ping, peak players), keyboard shortcuts (Escape key dismissal), and an inline custom server note editor.
- **Toggle Settings for History and Watchlist:** Added "Enable Connection History & History Tab" and "Enable Watchlist & Watchlist Tab" checkboxes in Settings. Disabling either feature hides its tab and sidebar entry, suppresses all background recording and polling, and hides the "Recently Played" filter pill. Re-enabling Watchlist immediately restarts background polling without requiring an app restart.

### Changed

- **Open Source Acknowledgments:** Updated the About modal and `acknowledgments.txt` to acknowledge `chart.js` (MIT) open-source usage.
- **Dependency & Security Updates:** Updated `axios` (1.19.0), `electron` (43.3.0), `globals` (17.9.0), and `lint-staged` (17.3.0) via `pnpm update`. Resolved all Dependabot/pnpm security advisories (`fast-uri`, `brace-expansion`) with 0 vulnerabilities remaining.

## [1.5.0] - 2026-07-29

### Added

- **Watchlist Auto-Join & Interactive Status Controls:** Renamed the Watchlist active column header to "Active" and added an "Auto-Join" toggle switch to each item in the Watchlist table along with an interactive server connection modal (`#autoJoinModal`). When an active watched server threshold triggers with Auto-Join enabled, DzLinux displays a 5-second cancelable countdown modal. When Auto-Join is disabled, clicking the notification or toast opens a regular connection prompt without a countdown timer. Clicking the "Last Status" badge or toggling a watched server's active switch immediately resets its status back to monitoring, and active desktop notification instances are retained in main-process memory to prevent garbage collection from breaking click listeners across tabs.
- **Expanded Automated Test Coverage:** Added 198 automated tests (242 → 440 total, overall statement coverage ~65% → ~77%). New suites cover the DXVK configuration writer (now 100%), the custom Proton launch pipeline (~94% — argument building, `%command%` expansion, GameMode/MangoHud wrappers, exit handling), server query port selection (~95% — CDN port → cached port → +1/+2/+3/27016 offset scanning, stale cache eviction, 30-day TTL, 5,000-entry cap, debounced cache writes), and all 46 IPC channels (~95% — input validation, payload filtering, and ping cancellation at the main-process boundary).

### Changed

- **Internal IPC Architecture:** Split the ~380-line IPC registration module into focused domain modules under `src/main/ipc/` (settings, servers, game, mods, watchlist, steamworks, system, plus a shared path-traversal guard). This is a pure refactor: all 46 IPC channels behave identically, verified by the full test suite without modification.
- **Simplified Settings Loading:** Removed a legacy sync/async settings-loading fallback from 14 call sites across the main process and deleted the redundant `loadSettings` alias. Settings now load through a single asynchronous path everywhere.
- **Dependency Updates:** Updated `eslint` (10.8.0), `electron` (43.2.0), `globals` (17.8.0), `lint-staged` (17.2.0), and `minimatch` (10.2.6 — the first release to declare the patched `brace-expansion ^5.0.8` floor).

### Fixed

- **Address Validation Consistency:** Aligned the renderer's Direct Join address validation with the main process's `net.isIP()` checks. Leading-zero IPv4 addresses (e.g. `01.2.3.4`) are now rejected, and all IPv6 forms (compressed addresses, zone IDs, IPv4-embedded suffixes) behave identically on both sides. A new parity test suite (103 cases) prevents the two validators from drifting apart again.
- **Test Isolation for Server Query Cache:** Fixed the server query test suite so cache tests run against a temporary directory instead of the real user cache at `~/.config/dzlinux/query_port_cache.json`.
- **Favorite Server Validation:** Manually adding a favorite now validates the IP/hostname and port in the renderer before saving (matching the main-process checks), and favorites are only committed to local state after a successful save — a rejected or failed save no longer leaves a phantom entry or an unhandled promise rejection.
- **Unbounded Favorites Pinging:** Refreshing favorite pings now runs through a bounded worker pool (at most 50 concurrent queries) instead of firing one GameDig query per favorite simultaneously, preventing UDP socket exhaustion on large favorite lists.
- **Toast Icon Identifier:** Replaced the last emoji-as-icon toast call site ("Checking for updates...") with the registered `rotate-ccw` icon per project icon conventions.

### Security

- **Vulnerability Remediation:** Resolved a high-severity denial-of-service advisory in transitive dependency `brace-expansion` (CVE-2026-14257 / GHSA-mh99-v99m-4gvg) by forcing `brace-expansion` to `^5.0.8` via workspace overrides in `pnpm-workspace.yaml`. Also upgraded `@electron/asar` to `^4.2.1` so release packaging stays on the compatible `minimatch` 10.x chain, avoiding the `brace_expansion_1.expand is not a function` packaging failure class addressed in 1.4.7. `pnpm audit` now reports zero known vulnerabilities.

## [1.4.7] - 2026-07-23

### Added

- **Safer Settings Validation:** Settings values are now checked before they are saved. Background server query concurrency is limited to **10–500**, and invalid values are automatically corrected.
- **Reliable Background Operations:** Added cancellation support for stale server pings and mod verification checks so refreshes and cancelled launches do not leave unnecessary work running in the background.
- **System Compatibility & Environment Diagnostics:** Added a system compatibility scanner in the Diagnostics tab that checks Steam installation status, installed Proton versions, Workshop storage space and write permissions, GameMode daemon status, MangoHud binary presence, and Vulkan GPU driver manifests.

### Changed

- **More Reliable Settings and Cache Storage:** Settings, watchlists, server data, and query-port information now use asynchronous, atomic file writes to reduce UI blocking and prevent partially-written JSON files.
- **Clearer Error Feedback:** Update downloads, external links, preference saves, and background mod operations now report failures instead of leaving controls stuck or failing silently.
- **Improved Startup Stability:** Application startup now initializes logging before loading settings and handles unrecoverable startup errors cleanly.
- **Safer Server Queries:** Server query requests are bounded, stale requests can be cancelled, and overlapping mod download checks are prevented.

### Fixed

- **Direct Join IP & Port Validation:** Enforced strict IPv4, IPv6, and FQDN domain validation in Direct Join inputs and server connection handlers to prevent launching DayZ with invalid addresses.
- **Offline Server Connection Guard:** Updated `query-mods` to return `null` on GameDig query timeouts or failures, preventing unreachable servers from being treated as vanilla servers and halting game launches with a clear toast notification.
- **Background Query Limit:** Users can no longer enter a background query concurrency value above 500. Values pasted or typed above the limit are immediately replaced with 500 (Counts higher than 500 can cause RAM overloads and crash the app).
- **Mod Verification Cancellation:** Cancelling the missing-mod dialog now stops its polling and prevents a delayed game launch from running afterward.
- **Update Download Recovery:** Failed update downloads restore the download controls and display an actionable error message.
- **CI Release Build Compatibility:** Fixed a build failure during `electron-builder` packaging (`brace_expansion_1.expand is not a function`) by scoping overrides in `pnpm-workspace.yaml` to prevent breaking `minimatch` module exports.
- **Non-blocking Master List Writes:** Master-list generation no longer uses synchronous filesystem writes during its asynchronous workflow.

### Security

- **Vulnerability Remediation:** Resolved 10 security advisories across transitive dependencies (`fast-uri`, `tar`, `brace-expansion`, `js-yaml`) by setting workspace overrides in `pnpm-workspace.yaml`.
- **Security Patch for Axios:** Upgraded `axios` dependency from `^1.17.0` to `^1.18.1` to address security advisories (GHSA-f4gw-2p7v-4548, GHSA-hcpx-6fm6-wx23, GHSA-7q8q-rj6j-mhjq, GHSA-mwf2-3pr3-8698).

## [1.4.6] - 2026-07-20

### Added

- **Environment Settings Tooltips:** Added interactive info tooltips (`<app-icon name="info">`) to Linux environment and wrapper options (MangoHud, GameMode, DXVK Async, PROTON_LOG, MALLOC_TRIM, PROTON_NO_ESYNC) in Settings, clarifying custom Proton support and providing exact Steam Launch Option syntax (`mangohud %command%`, `gamemoderun %command%`, etc.).
- **Proton Environment Enhancements:** Ensured `MANGOHUD=1` is automatically populated in process environment variables when launching through custom Proton paths.
- **Persistent Search Filters:** Search query, perspective, category, maps list, countries list, and filter flag parameters are now saved and persisted across launcher restarts.
- **Filter Options Menu:** Added a dedicated options button (`more-vertical`) on the far right of the filters bar that opens a context menu with options to manually save current filters, reset filters to default, and toggle the **Save Automatically** preference.
- **New SVG Icons:** Registered `rotate-ccw`, `more-vertical`, `bell`, `target`, and `zap` SVG vector shapes in the central registry.

### Changed

- **SVG Toast Icons:** Migrated all toast notifications throughout the application to explicitly use vector SVG icons (e.g. `save`, `alert`, `check`, `clipboard`, `eye`, `target`, `bell`, `zap`) instead of standard emojis. Simplified `showToast()` to automatically render standard icon identifiers as SVGs with a robust text fallback.
- **Master List Generation Improvements:** Refactored the server crawler and Steam API logic to retrieve a more complete and accurate master list of DayZ servers.
- **Enhanced Fake Server Protection:** Implemented player limit validations and strict inline deduplication checks to further reduce malicious and spoofed fake servers.
- **MangoHud Configuration**: Migrated MangoHud configuration from writing/backing up the global `MangoHud.conf` file to passing options via the `MANGOHUD_CONFIG` environment variable, eliminating disk writes, backups, and restore delays.

### Fixed

- **Country Filter Display:** Fixed an issue where the Country dropdown would disappear when no countries matched the active filters, keeping it visible at all times.
- **Startup Layout Shifting:** Hardcoded `compact-mode` and `layout-modern` classes on the HTML `<body>` element to align with settings defaults, preventing layout reflow shifts during application boot.
- **Server Query Cache Bounding**: Bounded the query port cache Map to 5,000 entries with oldest-entry eviction on overflow to prevent unbounded memory growth.
- **Game Launch Error UX**: Added pre-flight path validation for both Proton and the DayZ game binary. The launcher now rejects the game launch promise with helpful messages and displays a toast notification to the user rather than failing silently.
- **Log Stream Stability**: Improved `logger.js` to wait for file stream opening and catch unhandled stream error events, preventing application crashes during intensive logging.

## [1.4.5] - 2026-07-18

### Added

- **Warnings for Corrupted Mods:** Added clear warning messages when mod metadata files (`mod.cpp`) are unreadable to help troubleshoot corrupted mod installations.
- **Hide Favorites Filter:** Added a "Hide Favorites" filter to hide favorited servers from the main browser list (designed to help players with large favorite lists easily browse other servers).

### Changed

- **More Responsive Settings & Mod Loading:** Optimized settings saving and mod list loading so changes take effect instantly and the interface feels faster.
- **Sleeker, Cleaner Text:** Standardized casing across all menus and buttons (e.g., "GB free of", "Refresh", "Subscribe all") for a consistent look and feel.
- **Performance Cleanups:** Tidied up background code, removed unused modules, and improved app startup efficiency.

### Fixed

- **Server Connection & Playlists:**
  - Fixed a connection bug where clicking "Connect" from certain views could fail to launch the game.
  - Completely removed "Hide Fakes" filter button and its associated state logic, the hosted serverlist already does checks to combat fakes.
  - Favorite servers that are unlisted or offline now remain visible in the Favorites tab as dimmed placeholders, rather than disappearing completely.
  - Fixed favorites migration from older versions of the launcher losing their custom names.
  - Automatically heals and cleans up corrupted server history entries on startup to prevent UI crashes.
  - Fixed watchlist connection shortcuts to fall back to direct join if a watched server isn't found in the browser.
- **Faster, Smoother Launcher Startup:**
  - Rewrote directory scanners (such as looking for Steam and Workshop folders) to run in the background, keeping the window responsive during launch.
  - Fixed an interface lag issue when copying crash logs.
- **Mod & Dependency Troubleshooting:**
  - Fixed the mod list refresh button getting stuck on "Fetching..." when offline.
  - Prevented duplicate mod updates from running in parallel in the background.
  - Shows "Sync failed" instead of getting stuck on "Syncing..." if a mod subscription fails.
  - Fixed a calculation issue in the mod dependency scanner that could double-count missing items.
  - Added strict mod ID filters to keep background services stable.
- **Updates & General Stability:**
  - Single-instance enforcement: The launcher now ensures only one window is open at a time, preventing conflicts.
  - Safe-loading bootstrap: If a launcher component fails to load, the remaining modules will still load safely instead of crashing the entire app.
  - Added a timeout to update checks so the launcher won't freeze if GitHub is offline or slow.
  - Added helper notifications if update downloads fail, allowing you to easily retry.
  - Fixed safety boundaries for DXVK shader compiler settings, disk space queries, and GameMode triggers to prevent crashes.

## [1.4.4] - 2026-07-14

### Added

- Added a "Virtual List (Endless Scrolling)" option in settings to provide a progressive infinite scrolling experience, eliminating the need to click through pagination buttons.
- Added a "Subscribe All" button to the expanded server row header, allowing users to queue all missing mods for a server in a single click.

### Changed

- Streamlined the design of the mod chips in the expanded row by removing redundant "Not Subscribed" text and numeric Mod IDs for a cleaner look.
- Mod chips now automatically transform into a fully installed state (green checkmark) in the DOM the moment a Steamworks download completes, eliminating the need for a manual refresh.
- Completely decoupled the background ping loop from the table rendering engine and implemented in-place DOM sliding, instantly eliminating UI freezing and frame-drops when running massive chunk sizes (100+) in Virtual List mode.
- Renamed the "Server List Page Size" settings label to "Servers Per Page / Scroll Load" to accurately reflect its dual functionality for both pagination and virtual chunk sizing.
- Removed the active background polling interval for updates. The application now exclusively checks for updates on startup or when manually triggered by the user via the "Check for Updates" button to reduce background network overhead.
- Expanded server rows now automatically collapse when they are scrolled out of the visible viewport, preventing layout jitter and keeping the DOM clean.
- Standardized the pagination text string to sentence case consistently across all renderer events to fix uppercase flickering.

### Fixed

- Fixed a bug where clicking the Refresh button inside the expanded mod grid would leave the button stuck on "Fetching...". The mod grid now reconstructs itself in-place when a network fetch completes.
- Fixed a bug where the custom 'Servers Per Page' setting would revert to the default 50 items when the application restarted. The rendering engine now properly synchronizes pagination boundaries directly from local configuration cache during the bootstrap sequence.

## [1.4.3] - 2026-07-14

### Added

- Player name has been added to the launch parameters it can now be set from the Settings screen on the Launch Parameters card

### Changed

- Launch Presets tab switched with Storage Directories to make it more visible

### Fixed

## [1.4.2] - 2026-07-10

### Added

- **Server Country Code Added**: Added server country codes to the hosted_servers json.
- **Country Filter Support**: Implemented a dynamic country filter dropdown in the Advanced Filter bar. It aggregates unique country codes from loaded servers and includes a virtual `Europe (excl. RU)` option matching any European country except Russia.
- **Country Flag Boundary Tests**: Added comprehensive boundary unit tests for the `countryToFlag` helper function to validate invalid inputs such as `null`, `undefined`, empty values, incorrect lengths, types, and special characters.

### Changed

- **UI Casing Refactoring**: Replaced all-uppercase strings in UI copy and Toasts with sentence/title case across all renderer files to comply with Workspace Rule 10.
- **Table Headers**: Renamed the "HUD Link" table header to "Action" in the main server browser and favorites lists.
- **Async File System Migration**: Fully migrated background operations in `game/launchProton.js`, `ipcHandlers.js`, and `watchlist.js` to strictly use `fs.promises`, enforcing compliance with non-blocking event loop rules.

### Optimized

- **Steam Dependency Resolver Throttling**: Implemented an `asyncPool` concurrency limit (max 5) and TTL caching for `steamDependencyResolver.js` to eliminate unbounded Promise parallelization when fetching Steam Workshop mod details.
- **Renderer CPU Bottlenecks**: Redesigned `serverBrowserCore.js`, `favorites.js`, and `serverRow.js` to index the global server list using `O(1)` Map lookups instead of deep `O(N)` scans when mapping favorited items or refreshing filters, significantly reducing CPU load and `O(N*M)` bottlenecks.
- **Context Menu Memory Leak**: Migrated dynamic DOM creation in `contextMenu.js` to a static, pre-rendered hidden DOM element pattern to prevent memory leaks from uncollected event listeners.
- **Diagnostics Dashboard DOM**: Extracted 300+ lines of raw DOM generation from `diagnostics.js` into semantic HTML templates inside `index.html`. Refactored `diagnostics.js` to hydrate these elements instead of manually recreating them.

### Fixed

- **Promise Unhandled Rejections**: Standardized `.catch()` handling across volatile systems (`clipboard.writeText` in `feedback.js` and Server Connection Promises in `serverBrowserTable.js`).
- **Circular Dependencies**: Fixed import cyclic references between `contextMenu.js`, `favorites.js`, `settings.js`, `ui-behavior.js`, and `watchlist.js` by transitioning interconnected modules to an event-driven architecture using `document.dispatchEvent()`.
- **Block Scoping Errors**: Wrapped legacy `switch` cases in `serverBrowserTable.js` with `{}` to securely encapsulate block-scoped variables and prevent re-declaration runtime errors.
- **Event Listeners Integrity**: Replaced primitive `.onclick` bindings with standard `addEventListener()` calls across `updater.js` and renderer tables to support multiple, non-overriding listeners.
- **XSS & Legacy DOM Avoidance**: Purged all uses of `.innerHTML = ""` throughout renderer logic and replaced them with the modern, high-performance `.replaceChildren()` API.
- **ESLint Coverage**: Enforced `no-undef` compliance globally by confining `jest` global injections to an explicit `**/__tests__/**/*.js` override.
- **Ping Loop DOM Overheads**: Removed direct DOM queries from the high-frequency pinging loop in `serverBrowserRender.js`, replacing them with performant data attributes.
- **Server Browser List Population Performance**: Resolved a performance bottleneck where a server index map was rebuilt from scratch for every batch update, resulting in quadratic ($O(N^2)$) time complexity. It now utilizes a persistent module-level map, reducing lookup and insertion to linear ($O(N)$) time complexity.
- **Query Pool Memory Leaks**: Added an `isAborted` early-exit mechanism to the `fetchDayZServers` query pool to prevent lingering closures and Out of Memory (OOM) crashes during concurrent fetches.
- **Steamworks Shutdown Resource Leaks**: Fixed an uncancelled 15-second delay timeout in the `steamworksManager.js` shutdown routine that prevented clean garbage collection.
- **Log Parser Error Handling**: Added `try/catch` and safe logging when calling `fs.promises.stat` inside mapping loops in the log parser, preventing unhandled promise rejections on missing log files.
- **Watchlist Renderer Crashes**: Added defensive `.isDestroyed()` checks to the watchlist threshold IPC dispatcher to prevent exceptions when attempting to notify terminated renderer frames.
- **Server Indexing Data Corruption**: Fixed an array mutation logic bug in `buildPhonebookServers` where the source array was being improperly spliced during iteration.
- **Mismatch Banner XSS Hardening**: Sanitized dynamic variables (`daysOutdated`, `count`, and `more` strings) inside the outdated mods mismatch banner prior to `innerHTML` injection to prevent potential XSS injection attacks.
- **Safe Loadout Dropdown Reset**: Refactored the loadout selection dropdown reset logic to clear and replace child elements using the standard DOM `.replaceChildren()` method instead of `.innerHTML` assignment.
- **Watchlist Tab Navigation**: Fixed an undefined `window.switchTab` call in the watchlist by using a dynamic import to ensure the tab switching logic works without risking circular dependencies.
- **Settings Auto-Discovery**: Fixed a bug where a factory reset would persist an empty mod directory state. The settings manager now properly flushes the path cache before re-running auto-discovery.
- **Server Query Cache Race Conditions**: Removed duplicate and inconsistent in-memory writes that caused race conditions with the authoritative query port cache updater.
- **Watchlist Async Writes**: Updated watchlist save functions to properly await asynchronous filesystem operations to ensure accurate success responses.
- **Game Launch Error Handling**: Fixed a bug where `execFile` errors for Steam and Proton launches were not connected to their parent Promises, ensuring game start-up errors are now correctly propagated.

### Security

- **IPC Path Validation**: Hardened IPC path validation logic to restrict unauthorized access to arbitrary directories and properly resolve symlinks using `fs.realpathSync` to mitigate path traversal risks.
- **Installer Checksum Verification**: Enhanced the `install.sh` download script to automatically download and verify `.sha256` checksum files for release assets prior to installation.

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
