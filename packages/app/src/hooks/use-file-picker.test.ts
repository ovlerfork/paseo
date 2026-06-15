import { describe, expect, it } from "vitest";
import {
  pickFilesWithDesktopDialog,
  readDesktopFileBytes,
  type DesktopFilePickerDependencies,
  type DesktopFileReaderDependencies,
} from "./use-file-picker";
import type { DesktopDialogOpenOptions } from "@/desktop/host";

interface CopiedAttachmentFile {
  attachmentId: string;
  sourcePath: string;
  extension?: string | null;
}

class FakeDesktopFileReaderDependencies implements DesktopFileReaderDependencies {
  readonly copiedFiles: CopiedAttachmentFile[] = [];
  readonly reads: string[] = [];
  private nextId = 1;
  private readonly files = new Map<string, string>();

  async copyAttachmentFile(input: CopiedAttachmentFile): Promise<{ path: string; byteSize: number }> {
    this.copiedFiles.push(input);
    const managedPath = `/managed/${input.attachmentId}${input.extension ?? ".bin"}`;
    return { path: managedPath, byteSize: this.files.get(managedPath)?.length ?? 0 };
  }

  async readFileBase64(path: string): Promise<string> {
    this.reads.push(path);
    const base64 = this.files.get(path);
    if (base64 === undefined) {
      throw new Error(`FakeDesktopFileReaderDependencies: no file registered for ${path}`);
    }
    return base64;
  }

  createAttachmentId(): string {
    return `attachment-${this.nextId++}`;
  }

  registerManagedFile(path: string, base64: string): void {
    this.files.set(path, base64);
  }
}

class FakeDesktopFilePickerDependencies
  extends FakeDesktopFileReaderDependencies
  implements DesktopFilePickerDependencies
{
  readonly dialogOpenOptions: DesktopDialogOpenOptions[] = [];
  dialogSelection: string | string[] | null = null;

  async openDialog(options: DesktopDialogOpenOptions): Promise<string | string[] | null> {
    this.dialogOpenOptions.push(options);
    return this.dialogSelection;
  }
}

describe("use-file-picker", () => {
  it.each([
    ["/tmp/archive.zip", ".zip"],
    ["/tmp/report.pdf", ".pdf"],
    ["/tmp/data.csv", ".csv"],
  ])("passes dotted file extension %s to desktop managed storage", async (sourcePath, extension) => {
    const desktop = new FakeDesktopFileReaderDependencies();
    desktop.registerManagedFile(`/managed/attachment-1${extension}`, "AQID");

    const bytes = await readDesktopFileBytes(sourcePath, desktop);

    expect(desktop.copiedFiles).toEqual([
      {
        attachmentId: "attachment-1",
        sourcePath,
        extension,
      },
    ]);
    expect(desktop.reads).toEqual([`/managed/attachment-1${extension}`]);
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it("passes dotted file extensions for files selected with the desktop dialog", async () => {
    const desktop = new FakeDesktopFilePickerDependencies();
    desktop.dialogSelection = ["/tmp/archive.zip", "/tmp/report.pdf"];
    desktop.registerManagedFile("/managed/attachment-1.zip", "AQID");
    desktop.registerManagedFile("/managed/attachment-2.pdf", "BAUG");

    const files = await pickFilesWithDesktopDialog(desktop);

    expect(desktop.dialogOpenOptions).toEqual([{ directory: false, multiple: true }]);
    expect(desktop.copiedFiles).toEqual([
      {
        attachmentId: "attachment-1",
        sourcePath: "/tmp/archive.zip",
        extension: ".zip",
      },
      {
        attachmentId: "attachment-2",
        sourcePath: "/tmp/report.pdf",
        extension: ".pdf",
      },
    ]);
    expect(desktop.reads).toEqual(["/managed/attachment-1.zip", "/managed/attachment-2.pdf"]);
    expect(files).toEqual([
      {
        fileName: "archive.zip",
        mimeType: "application/zip",
        bytes: new Uint8Array([1, 2, 3]),
      },
      {
        fileName: "report.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([4, 5, 6]),
      },
    ]);
  });
});
