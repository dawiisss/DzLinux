const fs = require("fs");
const path = require("path");
const vm = require("vm");

describe("serverBrowserCore - serverPassesFilters", () => {
  let serverPassesFilters;
  let getCombinedAndFilteredServers;
  let context;

  beforeEach(() => {
    const corePath = path.resolve(__dirname, "../../src/renderer/serverBrowser/serverBrowserCore.js");
    const code = fs.readFileSync(corePath, "utf8");

    // Clean up ES Module imports and exports for Node's VM context
    const cleanCode = code
      .replace(/import\s+{[^}]+}\s+from\s+['"][^'"]+['"];/g, "")
      .replace(/export function/g, "function")
      .replace(/export const/g, "const")
      .replace(/export /g, "");

    context = {
      state: {
        filters: {
          name: "",
          nameLower: "",
          perspective: "all",
          category: "all",
          maps: new Set(),
          countries: new Set(),
        },
        flags: {
          favoritesOnly: false,
          hideFavorites: false,
          hideEmpty: false,
          hideFull: false,
          historyOnly: false,
          hideLocked: false,
        },
        favoritesSet: new Set(),
        historySet: new Set(),
      },
      MAP_NORMALIZE: {},
      EU_COUNTRIES: new Set([
        "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CY", "CZ", "DK", "EE",
        "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU",
        "SK", "SI", "ES", "SE", "CH", "UA", "GB", "VA",
      ]),
    };

    vm.createContext(context);
    vm.runInContext(cleanCode, context);

    serverPassesFilters = context.serverPassesFilters;
    getCombinedAndFilteredServers = context.getCombinedAndFilteredServers;
  });

  test("server passes filters by default", () => {
    const server = {
      realPing: 50,
      failedPing: false,
      players: 10,
      maxPlayers: 60,
      name: "DayZ US - Official",
      ip: "1.1.1.1",
      port: 2302,
      country: "US",
    };
    expect(serverPassesFilters(server)).toBe(true);
  });

  test("filters servers by specific country code", () => {
    const serverUS = {
      realPing: 50,
      failedPing: false,
      players: 10,
      maxPlayers: 60,
      name: "DayZ US - Official",
      ip: "1.1.1.1",
      port: 2302,
      country: "US",
    };
    const serverDE = {
      ...serverUS,
      country: "DE",
    };

    context.state.filters.countries.add("US");

    expect(serverPassesFilters(serverUS)).toBe(true);
    expect(serverPassesFilters(serverDE)).toBe(false);
  });

  test("filters servers by EU_EX_RU virtual code", () => {
    const serverDE = {
      realPing: 50,
      failedPing: false,
      players: 10,
      maxPlayers: 60,
      name: "DayZ DE - Official",
      ip: "1.1.1.1",
      port: 2302,
      country: "DE",
    };
    const serverRU = {
      ...serverDE,
      country: "RU",
    };
    const serverUS = {
      ...serverDE,
      country: "US",
    };

    context.state.filters.countries.add("EU_EX_RU");

    expect(serverPassesFilters(serverDE)).toBe(true); // DE is in Europe
    expect(serverPassesFilters(serverRU)).toBe(false); // RU is excluded
    expect(serverPassesFilters(serverUS)).toBe(false); // US is not in Europe
  });

  test("supports combining multiple countries and EU_EX_RU", () => {
    const serverDE = {
      realPing: 50,
      failedPing: false,
      players: 10,
      maxPlayers: 60,
      name: "DayZ DE - Official",
      ip: "1.1.1.1",
      port: 2302,
      country: "DE",
    };
    const serverUS = {
      ...serverDE,
      country: "US",
    };
    const serverRU = {
      ...serverDE,
      country: "RU",
    };

    context.state.filters.countries.add("EU_EX_RU");
    context.state.filters.countries.add("US");

    expect(serverPassesFilters(serverDE)).toBe(true);
    expect(serverPassesFilters(serverUS)).toBe(true);
    expect(serverPassesFilters(serverRU)).toBe(false);
  });

  test("ignores country filter when excludeCountryFilter is true", () => {
    const serverUS = {
      realPing: 50,
      failedPing: false,
      players: 10,
      maxPlayers: 60,
      name: "DayZ US - Official",
      ip: "1.1.1.1",
      port: 2302,
      country: "US",
    };
    const serverDE = {
      ...serverUS,
      country: "DE",
    };

    context.state.filters.countries.add("US");

    expect(serverPassesFilters(serverDE, false)).toBe(false);
    expect(serverPassesFilters(serverDE, true)).toBe(true);
  });

  describe("getCombinedAndFilteredServers", () => {
    beforeEach(() => {
      context.state.allServers = [
        {
          id: "server-1",
          ip: "1.1.1.1",
          port: 2302,
          name: "Online Server",
          realPing: 50,
          failedPing: false,
          players: 10,
          maxPlayers: 60,
        },
        {
          id: "server-2",
          ip: "2.2.2.2",
          port: 2302,
          name: "Offline Favorite",
          realPing: -1,
          failedPing: true,
        },
      ];
      context.state.favorites = [
        {
          ip: "1.1.1.1",
          port: 2302,
          name: "Online Server",
        },
        {
          ip: "2.2.2.2",
          port: 2302,
          name: "Offline Favorite",
        },
      ];
      context.state.favoritesSet = new Set(["1.1.1.1:2302", "2.2.2.2:2302"]);
      context.state.flags.favoritesOnly = false;
    });

    test("does not return offline/unlisted favorite placeholders when favoritesOnly is false", () => {
      const result = getCombinedAndFilteredServers();
      expect(result).toHaveLength(1);
      expect(result[0].ip).toBe("1.1.1.1");
    });

    test("does not return offline favorites even when favoritesOnly is true", () => {
      context.state.flags.favoritesOnly = true;
      const result = getCombinedAndFilteredServers();
      expect(result).toHaveLength(1);
      expect(result[0].ip).toBe("1.1.1.1");
    });

    test("filters out favorites when hideFavorites is true", () => {
      context.state.flags.hideFavorites = true;
      const result = getCombinedAndFilteredServers();
      expect(result).toHaveLength(0);
    });
  });
});
