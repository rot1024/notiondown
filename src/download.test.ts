import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "./interfaces.ts";
import { downloadAssetsWithRetry } from "./download.ts";

// Mock the downloadAssets function to simulate 403 errors
const mockDownloadAssets = vi.fn();

// Mock the Client class methods
const mockClient = {
  purgeCacheById: vi.fn(),
  getPostContent: vi.fn(),
} as unknown as Client;


describe("CLI Asset Download Retry Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully download assets on first try", async () => {
    const assets = new Map([["http://example.com/image.jpg", "/images/image.jpg"]]);

    mockDownloadAssets.mockResolvedValueOnce(undefined);

    await downloadAssetsWithRetry(assets, "post-123", mockClient, {
      dir: "/test/images",
      downloadAssets: mockDownloadAssets,
    });

    expect(mockDownloadAssets).toHaveBeenCalledTimes(1);
    expect(mockClient.purgeCacheById).not.toHaveBeenCalled();
    expect(mockClient.getPostContent).not.toHaveBeenCalled();
  });

  it("should retry after 403 error with fresh content", async () => {
    const originalAssets = new Map([["http://example.com/old-image.jpg", "/images/old-image.jpg"]]);
    const freshAssets = new Map([["http://example.com/fresh-image.jpg", "/images/fresh-image.jpg"]]);

    // First call fails with 403
    mockDownloadAssets.mockRejectedValueOnce(new Error("Failed to download http://example.com/old-image.jpg due to status code 403"));

    // Mock fresh content
    (mockClient.getPostContent as any).mockResolvedValueOnce({
      markdown: "# Fresh content",
      html: "<h1>Fresh content</h1>",
      assets: freshAssets,
    });

    // Second call succeeds
    mockDownloadAssets.mockResolvedValueOnce(undefined);

    await downloadAssetsWithRetry(originalAssets, "post-123", mockClient, {
      dir: "/test/images",
      downloadAssets: mockDownloadAssets,
    });

    expect(mockDownloadAssets).toHaveBeenCalledTimes(2);
    expect(mockClient.purgeCacheById).toHaveBeenCalledWith("post-123");
    expect(mockClient.getPostContent).toHaveBeenCalledWith("post-123");

    // First call with original assets
    expect(mockDownloadAssets).toHaveBeenNthCalledWith(1, originalAssets, expect.objectContaining({ dir: "/test/images" }));
    // Second call with fresh assets
    expect(mockDownloadAssets).toHaveBeenNthCalledWith(2, freshAssets, expect.objectContaining({ dir: "/test/images" }));
  });

  it("should rethrow non-403 errors immediately", async () => {
    const assets = new Map([["http://example.com/image.jpg", "/images/image.jpg"]]);

    const networkError = new Error("Network timeout");
    mockDownloadAssets.mockRejectedValueOnce(networkError);

    await expect(
      downloadAssetsWithRetry(assets, "post-123", mockClient, {
        dir: "/test/images",
        downloadAssets: mockDownloadAssets,
      })
    ).rejects.toThrow("Network timeout");

    expect(mockDownloadAssets).toHaveBeenCalledTimes(1);
    expect(mockClient.purgeCacheById).not.toHaveBeenCalled();
    expect(mockClient.getPostContent).not.toHaveBeenCalled();
  });

  it("should handle case where fresh content has no assets", async () => {
    const originalAssets = new Map([["http://example.com/image.jpg", "/images/image.jpg"]]);

    // First call fails with 403
    mockDownloadAssets.mockRejectedValueOnce(new Error("Failed to download http://example.com/image.jpg due to status code 403"));

    // Mock fresh content with no assets
    (mockClient.getPostContent as any).mockResolvedValueOnce({
      markdown: "# Fresh content",
      html: "<h1>Fresh content</h1>",
      assets: new Map(),
    });

    await downloadAssetsWithRetry(originalAssets, "post-123", mockClient, {
      dir: "/test/images",
      downloadAssets: mockDownloadAssets,
    });

    expect(mockDownloadAssets).toHaveBeenCalledTimes(1);
    expect(mockClient.purgeCacheById).toHaveBeenCalledWith("post-123");
    expect(mockClient.getPostContent).toHaveBeenCalledWith("post-123");
  });
});
