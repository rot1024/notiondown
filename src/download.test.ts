import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "./interfaces.ts";
import { downloadImagesWithRetry } from "./download.ts";

// Mock the downloadImages function to simulate 403 errors
const mockDownloadImages = vi.fn();

// Mock the Client class methods
const mockClient = {
  purgeCacheById: vi.fn(),
  getPostContent: vi.fn(),
} as unknown as Client;


describe("CLI Image Download Retry Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully download images on first try", async () => {
    const images = new Map([["http://example.com/image.jpg", "/images/image.jpg"]]);

    mockDownloadImages.mockResolvedValueOnce(undefined);

    await downloadImagesWithRetry(images, "post-123", mockClient, {
      dir: "/test/images",
      downloadImages: mockDownloadImages,
    });

    expect(mockDownloadImages).toHaveBeenCalledTimes(1);
    expect(mockClient.purgeCacheById).not.toHaveBeenCalled();
    expect(mockClient.getPostContent).not.toHaveBeenCalled();
  });

  it("should retry after 403 error with fresh content", async () => {
    const originalImages = new Map([["http://example.com/old-image.jpg", "/images/old-image.jpg"]]);
    const freshImages = new Map([["http://example.com/fresh-image.jpg", "/images/fresh-image.jpg"]]);

    // First call fails with 403
    mockDownloadImages.mockRejectedValueOnce(new Error("Failed to download http://example.com/old-image.jpg due to status code 403"));

    // Mock fresh content
    (mockClient.getPostContent as any).mockResolvedValueOnce({
      markdown: "# Fresh content",
      html: "<h1>Fresh content</h1>",
      images: freshImages,
    });

    // Second call succeeds
    mockDownloadImages.mockResolvedValueOnce(undefined);

    await downloadImagesWithRetry(originalImages, "post-123", mockClient, {
      dir: "/test/images",
      downloadImages: mockDownloadImages,
    });

    expect(mockDownloadImages).toHaveBeenCalledTimes(2);
    expect(mockClient.purgeCacheById).toHaveBeenCalledWith("post-123");
    expect(mockClient.getPostContent).toHaveBeenCalledWith("post-123");

    // First call with original images
    expect(mockDownloadImages).toHaveBeenNthCalledWith(1, originalImages, expect.objectContaining({ dir: "/test/images" }));
    // Second call with fresh images
    expect(mockDownloadImages).toHaveBeenNthCalledWith(2, freshImages, expect.objectContaining({ dir: "/test/images" }));
  });

  it("should rethrow non-403 errors immediately", async () => {
    const images = new Map([["http://example.com/image.jpg", "/images/image.jpg"]]);

    const networkError = new Error("Network timeout");
    mockDownloadImages.mockRejectedValueOnce(networkError);

    await expect(
      downloadImagesWithRetry(images, "post-123", mockClient, {
        dir: "/test/images",
        downloadImages: mockDownloadImages,
      })
    ).rejects.toThrow("Network timeout");

    expect(mockDownloadImages).toHaveBeenCalledTimes(1);
    expect(mockClient.purgeCacheById).not.toHaveBeenCalled();
    expect(mockClient.getPostContent).not.toHaveBeenCalled();
  });

  it("should handle case where fresh content has no images", async () => {
    const originalImages = new Map([["http://example.com/image.jpg", "/images/image.jpg"]]);

    // First call fails with 403
    mockDownloadImages.mockRejectedValueOnce(new Error("Failed to download http://example.com/image.jpg due to status code 403"));

    // Mock fresh content with no images
    (mockClient.getPostContent as any).mockResolvedValueOnce({
      markdown: "# Fresh content",
      html: "<h1>Fresh content</h1>",
      images: new Map(),
    });

    await downloadImagesWithRetry(originalImages, "post-123", mockClient, {
      dir: "/test/images",
      downloadImages: mockDownloadImages,
    });

    expect(mockDownloadImages).toHaveBeenCalledTimes(1);
    expect(mockClient.purgeCacheById).toHaveBeenCalledWith("post-123");
    expect(mockClient.getPostContent).toHaveBeenCalledWith("post-123");
  });
});
