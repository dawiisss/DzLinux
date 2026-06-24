describe("steamDependencyResolver", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function setupMock(responses) {
    let callIndex = 0;
    const mockAxios = {
      post: jest.fn(() => {
        const response =
          typeof responses === "function"
            ? responses(callIndex++)
            : Array.isArray(responses)
              ? responses[callIndex++]
              : responses;
        return Promise.resolve(response);
      }),
    };
    jest.doMock("axios", () => mockAxios);
    return mockAxios;
  }

  describe("resolveDependencies", () => {
    test("returns node with children from Steam API", async () => {
      setupMock({
        data: {
          response: {
            publishedfiledetails: [
              {
                result: 1,
                publishedfileid: "12345",
                title: "Test Mod",
                children: [
                  { publishedfileid: "111" },
                  { publishedfileid: "222" },
                ],
              },
            ],
          },
        },
      });

      const resolver = require("../../src/main/steamDependencyResolver");
      const tree = await resolver.resolveDependencies("12345");
      expect(tree.id).toBe("12345");
      expect(tree.name).toBe("Test Mod");
      expect(tree.children).toHaveLength(2);
    });

    test("handles API error gracefully", async () => {
      setupMock({
        data: {
          response: {
            publishedfiledetails: [
              {
                result: 0,
                publishedfileid: "12345",
              },
            ],
          },
        },
      });

      const resolver = require("../../src/main/steamDependencyResolver");
      const tree = await resolver.resolveDependencies("12345");
      expect(tree.id).toBe("12345");
      expect(tree.error).toBeTruthy();
    });

    test("handles network error", async () => {
      const mockAxios = {
        post: jest.fn(() => Promise.reject(new Error("Network error"))),
      };
      jest.doMock("axios", () => mockAxios);

      const resolver = require("../../src/main/steamDependencyResolver");
      const tree = await resolver.resolveDependencies("12345");
      expect(tree.id).toBe("12345");
      expect(tree.error).toBeTruthy();
    });

    test("detects circular references", async () => {
      setupMock((callIndex) => {
        if (callIndex === 0) {
          return {
            data: {
              response: {
                publishedfiledetails: [
                  {
                    result: 1,
                    publishedfileid: "AAA",
                    title: "Mod A",
                    children: [{ publishedfileid: "BBB" }],
                  },
                ],
              },
            },
          };
        } else {
          return {
            data: {
              response: {
                publishedfiledetails: [
                  {
                    result: 1,
                    publishedfileid: "BBB",
                    title: "Mod B",
                    children: [{ publishedfileid: "AAA" }],
                  },
                ],
              },
            },
          };
        }
      });

      const resolver = require("../../src/main/steamDependencyResolver");
      const tree = await resolver.resolveDependencies("AAA");
      expect(tree.id).toBe("AAA");
      expect(tree.children).toHaveLength(1);
      expect(tree.children[0].id).toBe("BBB");
      expect(tree.children[0].children[0].circular).toBe(true);
    });

    test("truncates at max depth", async () => {
      // Each call returns a unique modId with one child to actually reach max depth
      // without triggering circular detection
      setupMock((callIndex) => {
        const modId = `MOD_L${callIndex}`;
        const childId = `MOD_L${callIndex + 1}`;
        return {
          data: {
            response: {
              publishedfiledetails: [
                {
                  result: 1,
                  publishedfileid: modId,
                  title: `Mod Level ${callIndex}`,
                  children: [{ publishedfileid: childId }],
                },
              ],
            },
          },
        };
      });

      const resolver = require("../../src/main/steamDependencyResolver");
      const tree = await resolver.resolveDependencies("MOD_L0");
      expect(tree.id).toBe("MOD_L0");

      function findTruncated(node) {
        if (node.truncated) return true;
        for (const child of node.children || []) {
          if (findTruncated(child)) return true;
        }
        return false;
      }
      expect(findTruncated(tree)).toBe(true);
    });
  });

  describe("resolveBatchDependencies", () => {
    test("resolves multiple mods", async () => {
      setupMock({
        data: {
          response: {
            publishedfiledetails: [
              {
                result: 1,
                publishedfileid: "123",
                title: "Mod",
                children: [],
              },
            ],
          },
        },
      });

      const resolver = require("../../src/main/steamDependencyResolver");
      const results = await resolver.resolveBatchDependencies(["111", "222"]);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("111");
      expect(results[1].id).toBe("222");
    });
  });

  describe("getFlatList", () => {
    test("flattens tree into deduplicated list", () => {
      jest.doMock("axios", () => ({ post: jest.fn() }));
      const resolver = require("../../src/main/steamDependencyResolver");

      const tree = {
        id: "root",
        name: "Root",
        children: [
          {
            id: "a",
            name: "A",
            children: [{ id: "b", name: "B", children: [] }],
          },
          { id: "b", name: "B", children: [] },
          { id: "c", name: "C", children: [] },
        ],
      };

      const list = resolver.getFlatList(tree);
      expect(list).toHaveLength(4);
      expect(list.map((i) => i.id)).toEqual(["root", "a", "b", "c"]);
    });

    test("handles empty tree", () => {
      jest.doMock("axios", () => ({ post: jest.fn() }));
      const resolver = require("../../src/main/steamDependencyResolver");

      const tree = { id: "root", name: "Root", children: [] };
      const list = resolver.getFlatList(tree);
      expect(list).toHaveLength(1);
    });
  });

  describe("cache", () => {
    test("caches successful results", async () => {
      setupMock({
        data: {
          response: {
            publishedfiledetails: [
              {
                result: 1,
                publishedfileid: "123",
                title: "Cached Mod",
                children: [],
              },
            ],
          },
        },
      });

      const resolver = require("../../src/main/steamDependencyResolver");
      await resolver.resolveDependencies("123");
      const result = await resolver.resolveDependencies("123");
      expect(result.name).toBe("Cached Mod");
      expect(jest.requireMock("axios").post).toHaveBeenCalledTimes(1);
    });
  });
});
