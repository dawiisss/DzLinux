const fs = require("fs");
const path = require("path");
const vm = require("vm");
const mainValidation = require("../../src/main/validation");

// The main process validates IPC payloads with node:net (validation.js) while
// the renderer pre-validates user input with regexes (utils.js). This suite
// guarantees both implementations agree, so the direct-connect UI can never
// accept an address the main process would reject (or vice versa).

describe("validation parity (main process vs renderer)", () => {
  let rendererIsValidIpOrHost;
  let rendererIsValidPort;

  beforeAll(() => {
    const utilsPath = path.resolve(__dirname, "../../src/renderer/utils.js");
    const code = fs.readFileSync(utilsPath, "utf8");

    // Strip ES Module export statements for Node's VM context
    // (utils.js has no import statements to resolve)
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

    rendererIsValidIpOrHost = context.isValidIpOrHost;
    rendererIsValidPort = context.isValidPort;
  });

  const ipHostCorpus = [
    // IPv4 — valid
    "1.2.3.4",
    "0.0.0.0",
    "255.255.255.255",
    "192.168.1.1",
    "127.0.0.1",
    // IPv4 — invalid (out of range, wrong shape, leading zeros)
    "256.1.1.1",
    "1.2.3.4.5",
    "1.2.3",
    "01.2.3.4",
    "001.2.3.4",
    "0.0.0.00",
    "1.2.3.04",
    // IPv6 — full and compressed forms
    "::1",
    "::",
    "fe80::1",
    "FE80::1",
    "2001:db8::ff00:42:8329",
    "2001:0db8:0000:0000:0000:ff00:0042:8329",
    "2001:db8:0:0:0:ff00:42:8329",
    "1234::5678:9abc:def0",
    "fe80:0:0:0:0:0:0:1",
    // IPv6 — invalid
    ":::",
    "1:2:3:4:5:6:7:8:9",
    "gg::1",
    "2001:db8::g1::1",
    "1::2::3",
    // IPv6 zone IDs (net.isIP accepts them on any IPv6 address)
    "fe80::1%eth0",
    "fe80::1%1",
    "FE80::1%eth0",
    "2001:db8::1%eth0",
    "::1%eth0",
    "::%eth0",
    "fe80::1%",
    "fe80%eth0::1",
    "fe80::1%et h0",
    "1.2.3.4%eth0",
    "::1%",
    // IPv4-embedded IPv6
    "::ffff:1.2.3.4",
    "::ffff:192.168.0.1",
    "::ffff:01.2.3.4",
    "::ffff:999.1.1.1",
    "::ffff:0:1.2.3.4",
    "::ffff:0.0.0.0",
    "2001:db8:0:0:0:0:0:1.2.3.4",
    "::1.2.3.4",
    "::0:1.2.3.4",
    "::abcd:1.2.3.4",
    "::fffff:1.2.3.4",
    "1:2:3:4:5:6:1.2.3.4",
    "1:2:3:4:5::1.2.3.4",
    "1:2:3:4::1.2.3.4",
    "0:0:0:0:0:ffff:1.2.3.4",
    "1:2:3:4:5:6:7:1.2.3.4",
    // Combined IPv6 + zone ID + embedded IPv4
    "fe80::1.2.3.4%eth0",
    "::ffff:1.2.3.4%eth0",
    "::ffff:1.2.3.4%",
    // localhost and hostnames
    "localhost",
    "LOCALHOST",
    "LocalHost",
    "example.com",
    "play.example-server.com",
    "dayz.server123.org",
    "a.b",
    "example.c",
    "-bad.com",
    "bad-.com",
    "example..com",
    "ex ample.com",
    "test2",
    "invalid_host",
    "12345",
    // misc edge cases
    "",
    "1.2.3.4 ",
    " 1.2.3.4",
    `${"a".repeat(63)}.com`,
    `${"a".repeat(64)}.com`,
    "x".repeat(254),
  ];

  const nonStringInputs = [null, undefined, 123, 23.5, true, {}];

  const portCorpus = [
    1,
    2302,
    65535,
    "2302",
    "1",
    "65535",
    0,
    65536,
    -1,
    "0",
    "abc",
    "23.5",
    23.5,
    "",
    " 2302",
    "2302 ",
    NaN,
    true,
    false,
    null,
  ];

  describe("isValidIpOrHost", () => {
    test.each(ipHostCorpus)("agrees on %j", (input) => {
      expect(rendererIsValidIpOrHost(input)).toBe(
        mainValidation.isValidIpOrHost(input),
      );
    });

    test.each(nonStringInputs)("rejects non-string input %j", (input) => {
      expect(rendererIsValidIpOrHost(input)).toBe(false);
      expect(mainValidation.isValidIpOrHost(input)).toBe(false);
    });
  });

  describe("isValidPort", () => {
    test.each(portCorpus)("agrees on %j", (input) => {
      expect(rendererIsValidPort(input)).toBe(
        mainValidation.isValidPort(input),
      );
    });
  });
});
