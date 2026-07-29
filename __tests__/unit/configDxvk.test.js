const path = require("path");

describe("configDxvk", () => {
  let mockAccess;
  let mockMkdir;
  let mockWriteFile;
  let configureDxvk;

  const compatDataPath = "/steam/steamapps/compatdata/221100";
  const dxvkConfDir = path.join(compatDataPath, "pfx");
  const dxvkConfPath = path.join(dxvkConfDir, "dxvk.conf");

  beforeEach(() => {
    jest.resetModules();

    mockAccess = jest.fn().mockResolvedValue(); // pfx dir exists by default
    mockMkdir = jest.fn().mockResolvedValue();
    mockWriteFile = jest.fn().mockResolvedValue();

    jest.doMock("fs", () => ({
      promises: {
        access: mockAccess,
        mkdir: mockMkdir,
        writeFile: mockWriteFile,
      },
    }));

    ({ configureDxvk } = require("../../src/main/game/configDxvk"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("uses custom dxvkConfig lines verbatim, dropping blank lines", async () => {
    const settings = {
      dxvkConfig: "dxvk.enableAsync = True\n\ndxvk.numCompilerThreads = 4\n   \n",
    };
    const env = {};

    await configureDxvk(settings, compatDataPath, env);

    expect(env.DXVK_CONFIG).toBe(
      "dxvk.enableAsync = True; dxvk.numCompilerThreads = 4",
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      dxvkConfPath,
      "dxvk.enableAsync = True\ndxvk.numCompilerThreads = 4",
      "utf8",
    );
  });

  test("builds config from async toggle and thread count when no custom config", async () => {
    const settings = {
      dxvkConfig: "",
      dxvkAsyncEnabled: true,
      dxvkThreads: "8",
    };
    const env = {};

    await configureDxvk(settings, compatDataPath, env);

    expect(env.DXVK_CONFIG).toBe(
      "dxvk.enableAsync = True; dxvk.numCompilerThreads = 8",
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      dxvkConfPath,
      "dxvk.enableAsync = True\ndxvk.numCompilerThreads = 8",
      "utf8",
    );
  });

  test("omits the async line when dxvkAsyncEnabled is false", async () => {
    const settings = { dxvkAsyncEnabled: false, dxvkThreads: "4" };
    const env = {};

    await configureDxvk(settings, compatDataPath, env);

    expect(env.DXVK_CONFIG).toBe("dxvk.numCompilerThreads = 4");
  });

  test("ignores invalid thread counts", async () => {
    for (const dxvkThreads of ["0", "abc", "-3"]) {
      const settings = { dxvkAsyncEnabled: false, dxvkThreads };
      const env = {};

      await configureDxvk(settings, compatDataPath, env);

      expect(env.DXVK_CONFIG).toBeUndefined();
    }
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  test("does nothing when no DXVK options are set", async () => {
    const env = {};

    await configureDxvk({}, compatDataPath, env);

    expect(env.DXVK_CONFIG).toBeUndefined();
    expect(mockAccess).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  test("skips mkdir when the pfx directory already exists", async () => {
    const settings = { dxvkAsyncEnabled: true, dxvkThreads: "0" };

    await configureDxvk(settings, compatDataPath, {});

    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
  });

  test("creates the pfx directory recursively when missing", async () => {
    mockAccess.mockRejectedValue(new Error("ENOENT"));
    const settings = { dxvkAsyncEnabled: true, dxvkThreads: "0" };

    await configureDxvk(settings, compatDataPath, {});

    expect(mockMkdir).toHaveBeenCalledWith(dxvkConfDir, { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      dxvkConfPath,
      "dxvk.enableAsync = True",
      "utf8",
    );
  });

  test("logs but does not throw when writing dxvk.conf fails", async () => {
    mockWriteFile.mockRejectedValue(new Error("EACCES"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const settings = { dxvkAsyncEnabled: true, dxvkThreads: "0" };
    const env = {};

    await expect(
      configureDxvk(settings, compatDataPath, env),
    ).resolves.toBeUndefined();

    // env var is still set so Proton gets the config even if the file write failed
    expect(env.DXVK_CONFIG).toBe("dxvk.enableAsync = True");
    expect(errorSpy).toHaveBeenCalled();
  });
});
