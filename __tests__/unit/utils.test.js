const fs = require("fs");
const path = require("path");
const vm = require("vm");

describe("renderer utils - countryToFlag", () => {
  let countryToFlag;
  let isValidIpOrHost;
  let isValidPort;

  beforeAll(() => {
    const utilsPath = path.resolve(__dirname, "../../src/renderer/utils.js");
    const code = fs.readFileSync(utilsPath, "utf8");

    // Clean up ES Module export statements for Node's VM context
    const cleanCode = code
      .replace(/export function/g, "function")
      .replace(/export const/g, "const")
      .replace(/export /g, "");

    const context = {
      document: {
        createElement: () => ({}),
      },
    };
    vm.createContext(context);
    vm.runInContext(cleanCode, context);

    countryToFlag = context.countryToFlag;
    isValidIpOrHost = context.isValidIpOrHost;
    isValidPort = context.isValidPort;
  });

  test("returns flag emoji for valid uppercase 2-letter country codes", () => {
    expect(countryToFlag("US")).toBe("🇺🇸");
    expect(countryToFlag("CZ")).toBe("🇨🇿");
    expect(countryToFlag("GB")).toBe("🇬🇧");
  });

  test("returns flag emoji for valid lowercase 2-letter country codes", () => {
    expect(countryToFlag("us")).toBe("🇺🇸");
    expect(countryToFlag("cz")).toBe("🇨🇿");
    expect(countryToFlag("gb")).toBe("🇬🇧");
  });

  test("returns empty string for null or undefined input", () => {
    expect(countryToFlag(null)).toBe("");
    expect(countryToFlag(undefined)).toBe("");
  });

  test("returns empty string for empty string input", () => {
    expect(countryToFlag("")).toBe("");
  });

  test("returns empty string for codes that are not exactly 2 characters", () => {
    expect(countryToFlag("U")).toBe("");
    expect(countryToFlag("USA")).toBe("");
    expect(countryToFlag("A")).toBe("");
  });

  test("returns empty string for non-alphabetical or special character codes", () => {
    expect(countryToFlag("12")).toBe("");
    expect(countryToFlag("U!")).toBe("");
    expect(countryToFlag("US1")).toBe("");
    expect(countryToFlag("  ")).toBe("");
  });

  test("returns empty string for non-string types", () => {
    expect(countryToFlag(12)).toBe("");
    expect(countryToFlag(true)).toBe("");
    expect(countryToFlag({})).toBe("");
  });

  describe("isValidIpOrHost", () => {
    test("validates valid IPv4 addresses", () => {
      expect(isValidIpOrHost("1.2.3.4")).toBe(true);
      expect(isValidIpOrHost("192.168.1.1")).toBe(true);
      expect(isValidIpOrHost("127.0.0.1")).toBe(true);
    });

    test("validates valid domain names and localhost", () => {
      expect(isValidIpOrHost("localhost")).toBe(true);
      expect(isValidIpOrHost("dayz.example.com")).toBe(true);
      expect(isValidIpOrHost("server-1.myhost.org")).toBe(true);
    });

    test("rejects invalid IP addresses and hostnames without TLDs", () => {
      expect(isValidIpOrHost("test2")).toBe(false);
      expect(isValidIpOrHost("invalid_host")).toBe(false);
      expect(isValidIpOrHost("256.1.1.1")).toBe(false);
      expect(isValidIpOrHost("12345")).toBe(false);
      expect(isValidIpOrHost("")).toBe(false);
      expect(isValidIpOrHost(null)).toBe(false);
    });
  });

  describe("isValidPort", () => {
    test("validates valid port numbers", () => {
      expect(isValidPort(2302)).toBe(true);
      expect(isValidPort("2302")).toBe(true);
      expect(isValidPort(1)).toBe(true);
      expect(isValidPort(65535)).toBe(true);
    });

    test("rejects invalid ports", () => {
      expect(isValidPort(0)).toBe(false);
      expect(isValidPort(65536)).toBe(false);
      expect(isValidPort(-1)).toBe(false);
      expect(isValidPort("abc")).toBe(false);
      expect(isValidPort(null)).toBe(false);
    });
  });
});



