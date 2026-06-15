import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDesktopFileBytes } from "./use-file-picker";

const mocks = vi.hoisted(() => ({
  copyDesktopAttachmentFile: vi.fn(),
  readDesktopFileBase64: vi.fn(),
}));

vi.mock("@/desktop/attachments/desktop-file-commands", () => ({
  copyDesktopAttachmentFile: mocks.copyDesktopAttachmentFile,
}));

vi.mock("@/desktop/attachments/desktop-preview-url", () => ({
  readDesktopFileBase64: mocks.readDesktopFileBase64,
}));

describe("use-file-picker", () => {
  beforeEach(() => {
    mocks.copyDesktopAttachmentFile.mockReset();
    mocks.readDesktopFileBase64.mockReset();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000000");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes dotted archive extensions to desktop managed storage", async () => {
    mocks.copyDesktopAttachmentFile.mockResolvedValue({
      path: "/managed/attachment-id.zip",
      byteSize: 3,
    });
    mocks.readDesktopFileBase64.mockResolvedValue("AQID");

    const bytes = await readDesktopFileBytes("/tmp/archive.zip");

    expect(mocks.copyDesktopAttachmentFile).toHaveBeenCalledWith({
      attachmentId: "00000000-0000-4000-8000-000000000000",
      sourcePath: "/tmp/archive.zip",
      extension: ".zip",
    });
    expect(mocks.readDesktopFileBase64).toHaveBeenCalledWith("/managed/attachment-id.zip");
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });
});
