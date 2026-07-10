const fs = require("fs");
const path = require("path");
const vm = require("vm");

describe("renderer utils - countryToFlag", () => {
  let countryToFlag;

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
});
