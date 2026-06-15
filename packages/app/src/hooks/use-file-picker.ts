import { useCallback, useRef } from "react";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { getDesktopHost, isElectronRuntime, type DesktopDialogOpenOptions } from "@/desktop/host";
import { copyDesktopAttachmentFile } from "@/desktop/attachments/desktop-file-commands";
import { readDesktopFileBase64 } from "@/desktop/attachments/desktop-preview-url";
import { isWeb } from "@/constants/platform";
import { getFileExtension, getMimeTypeFromPath } from "@/attachments/file-types";

export interface PickedFile {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface DesktopFileReaderDependencies {
  copyAttachmentFile(input: {
    attachmentId: string;
    sourcePath: string;
    extension?: string | null;
  }): Promise<{ path: string; byteSize: number }>;
  readFileBase64(path: string): Promise<string>;
  createAttachmentId(): string;
}

export interface DesktopFilePickerDependencies extends DesktopFileReaderDependencies {
  openDialog(options: DesktopDialogOpenOptions): Promise<string | string[] | null>;
}

const defaultDesktopFilePickerDependencies: DesktopFilePickerDependencies = {
  copyAttachmentFile: copyDesktopAttachmentFile,
  readFileBase64: readDesktopFileBase64,
  createAttachmentId: () => crypto.randomUUID(),
  async openDialog(options) {
    const dialogOpen = getDesktopHost()?.dialog?.open;
    if (typeof dialogOpen !== "function") {
      throw new Error("Desktop dialog API is not available.");
    }

    return await dialogOpen(options);
  },
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function readDesktopFileBytes(
  path: string,
  dependencies: DesktopFileReaderDependencies = defaultDesktopFilePickerDependencies,
): Promise<Uint8Array> {
  const { path: managedPath } = await dependencies.copyAttachmentFile({
    attachmentId: dependencies.createAttachmentId(),
    sourcePath: path,
    extension: getFileExtension(path) || null,
  });
  const base64 = await dependencies.readFileBase64(managedPath);
  return base64ToUint8Array(base64);
}

export async function pickFilesWithDesktopDialog(
  dependencies: DesktopFilePickerDependencies = defaultDesktopFilePickerDependencies,
): Promise<PickedFile[] | null> {
  const selection = await dependencies.openDialog({
    directory: false,
    multiple: true,
  });

  if (!selection) {
    return null;
  }

  const paths = Array.isArray(selection) ? selection : [selection];
  if (paths.length === 0) {
    return null;
  }

  const result: PickedFile[] = [];

  for (const filePath of paths) {
    const fileName = filePath.split("/").pop() ?? filePath.split("\\").pop() ?? filePath;
    const mimeType = getMimeTypeFromPath(filePath);

    // Copy into managed storage so we can read it through the existing secure IPC.
    const { path: managedPath } = await dependencies.copyAttachmentFile({
      attachmentId: dependencies.createAttachmentId(),
      sourcePath: filePath,
      extension: getFileExtension(filePath) || null,
    });

    const base64 = await dependencies.readFileBase64(managedPath);
    const bytes = base64ToUint8Array(base64);

    result.push({ fileName, mimeType, bytes });
  }

  return result;
}

function pickFilesWithWebInput(): Promise<PickedFile[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.style.display = "none";

    input.addEventListener("change", async () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) {
        resolve(null);
        return;
      }

      const result: PickedFile[] = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        result.push({
          fileName: file.name,
          mimeType: file.type || getMimeTypeFromPath(file.name),
          bytes,
        });
      }
      resolve(result);
    });

    input.addEventListener("cancel", () => {
      resolve(null);
    });

    document.body.appendChild(input);
    input.click();

    // Clean up after a short delay to allow the change event to fire
    setTimeout(() => {
      input.remove();
    }, 60_000);
  });
}

async function pickFilesWithDocumentPicker(): Promise<PickedFile[] | null> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  return await Promise.all(
    result.assets.map(async (asset) => ({
      fileName: asset.name,
      mimeType: asset.mimeType ?? getMimeTypeFromPath(asset.name),
      bytes: await new File(asset.uri).bytes(),
    })),
  );
}

export function useFilePicker() {
  const isPickingRef = useRef(false);

  const pickFiles = useCallback(async (): Promise<PickedFile[] | null> => {
    if (isPickingRef.current) {
      return null;
    }
    isPickingRef.current = true;

    try {
      if (isWeb && isElectronRuntime()) {
        return await pickFilesWithDesktopDialog();
      }

      if (isWeb) {
        return await pickFilesWithWebInput();
      }

      return await pickFilesWithDocumentPicker();
    } catch (error) {
      console.error("[FilePicker] Failed to pick files:", error);
      throw error;
    } finally {
      isPickingRef.current = false;
    }
  }, []);

  return { pickFiles };
}
