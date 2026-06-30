import { afterEach, describe, expect, test, vi } from "vitest";
import { CodeGenConfig } from "../src/configuration.js";
import { Request } from "../src/util/request.js";

vi.mock("../src/util/remote-schema-fetch.js", () => ({
  fetchRemoteSchemaResponse: vi.fn(),
  isSameHttpOrigin: vi.fn(),
}));

import { fetchRemoteSchemaResponse, isSameHttpOrigin } from "../src/util/remote-schema-fetch.js";

const mockFetchRemoteSchemaResponse = vi.mocked(fetchRemoteSchemaResponse);
const mockIsSameHttpOrigin = vi.mocked(isSameHttpOrigin);

describe("Request.download", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("returns response text on success", async () => {
    const config = new CodeGenConfig({ url: "http://example.com/spec.json" });
    const request = new Request(config);

    mockIsSameHttpOrigin.mockReturnValue(true);
    mockFetchRemoteSchemaResponse.mockResolvedValue(
      new Response('{"openapi":"3.0.0"}', { status: 200 }),
    );

    const result = await request.download({
      url: "http://example.com/spec.json",
      authToken: "Bearer token",
    });

    expect(result).toBe('{"openapi":"3.0.0"}');
  });

  test("includes auth header when URL is same-origin as config.url", async () => {
    const config = new CodeGenConfig({ url: "http://example.com/spec.json" });
    const request = new Request(config);

    mockIsSameHttpOrigin.mockReturnValue(true);
    mockFetchRemoteSchemaResponse.mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    await request.download({
      url: "http://example.com/spec.json",
      authToken: "Bearer token",
    });

    expect(mockFetchRemoteSchemaResponse).toHaveBeenCalledWith(
      "http://example.com/spec.json",
      expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
      expect.objectContaining({
        specSourceUrl: "http://example.com/spec.json",
        allowExplicitSpecUrl: true,
      }),
    );
  });

  test("omits auth header when URL is cross-origin to config.url", async () => {
    const config = new CodeGenConfig({ url: "http://example.com/spec.json" });
    const request = new Request(config);

    mockIsSameHttpOrigin.mockReturnValue(false);
    mockFetchRemoteSchemaResponse.mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    await request.download({
      url: "http://other.com/spec.json",
      authToken: "Bearer token",
    });

    expect(mockFetchRemoteSchemaResponse).toHaveBeenCalledWith(
      "http://other.com/spec.json",
      expect.not.objectContaining({ headers: expect.anything() }),
      expect.anything(),
    );
  });

  test("omits auth header when no authToken provided", async () => {
    const config = new CodeGenConfig({ url: "http://example.com/spec.json" });
    const request = new Request(config);

    mockFetchRemoteSchemaResponse.mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    await request.download({ url: "http://example.com/spec.json" });

    expect(mockFetchRemoteSchemaResponse).toHaveBeenCalledWith(
      "http://example.com/spec.json",
      expect.not.objectContaining({ headers: expect.anything() }),
      expect.anything(),
    );
  });

  test("passes allowExplicitSpecUrl: true in policy", async () => {
    const config = new CodeGenConfig({ url: "http://example.com/spec.json" });
    const request = new Request(config);

    mockFetchRemoteSchemaResponse.mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    await request.download({ url: "http://example.com/spec.json" });

    expect(mockFetchRemoteSchemaResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ allowExplicitSpecUrl: true }),
    );
  });

  test("passes specSourceUrl from config.url", async () => {
    const config = new CodeGenConfig({ url: "http://example.com/spec.json" });
    const request = new Request(config);

    mockFetchRemoteSchemaResponse.mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    await request.download({ url: "http://example.com/spec.json" });

    expect(mockFetchRemoteSchemaResponse).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ specSourceUrl: "http://example.com/spec.json" }),
    );
  });

  test("throws when fetchRemoteSchemaResponse returns null (SSRF blocked)", async () => {
    const config = new CodeGenConfig({ url: "http://example.com/spec.json" });
    const request = new Request(config);

    mockIsSameHttpOrigin.mockReturnValue(false);
    mockFetchRemoteSchemaResponse.mockResolvedValue(null);

    await expect(
      request.download({ url: "http://evil.internal/spec.json" }),
    ).rejects.toThrow('URL "http://evil.internal/spec.json" is not allowed for fetching');
  });

  test("throws when response.text() fails", async () => {
    const config = new CodeGenConfig({ url: "http://example.com/spec.json" });
    const request = new Request(config);

    const response = new Response("ok", { status: 200 });
    vi.spyOn(response, "text").mockRejectedValue(new Error("stream error"));

    mockIsSameHttpOrigin.mockReturnValue(true);
    mockFetchRemoteSchemaResponse.mockResolvedValue(response);

    await expect(
      request.download({
        url: "http://example.com/spec.json",
        authToken: "Bearer token",
      }),
    ).rejects.toThrow('error while fetching data from URL "http://example.com/spec.json"');
  });

  test("merges config.requestOptions into fetch options", async () => {
    const config = new CodeGenConfig({
      url: "http://example.com/spec.json",
      requestOptions: { headers: { "X-Custom": "value" } },
    });
    const request = new Request(config);

    mockIsSameHttpOrigin.mockReturnValue(true);
    mockFetchRemoteSchemaResponse.mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    await request.download({
      url: "http://example.com/spec.json",
      authToken: "Bearer token",
    });

    const callArgs = mockFetchRemoteSchemaResponse.mock.calls[0];
    const initArg = callArgs[1] as Record<string, unknown>;
    const headers = initArg.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer token");
    expect(headers["X-Custom"]).toBe("value");
  });
});
