import { useRef, useState, useCallback, useEffect } from "react";
import {
  compressImage,
  type CompressionResult,
  type CompressionOptions,
} from "@/lib/image-compression";

export function useFileUpload(compressionOptions?: CompressionOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<FileList | undefined>(undefined);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [compressionInfo, setCompressionInfo] = useState<CompressionResult[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);

  // Process files (images get compressed, PDFs pass through)
  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsCompressing(true);
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const pdfFiles = files.filter((f) => f.type === "application/pdf");

    try {
      const results: CompressionResult[] = [];
      const previews: string[] = [];
      const dataTransfer = new DataTransfer();

      // Process images (compress them)
      for (const file of imageFiles) {
        const result = await compressImage(file, compressionOptions);
        results.push(result);

        // Generate preview from compressed blob
        const reader = new FileReader();
        const previewPromise = new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(result.blob);
        });
        previews.push(await previewPromise);

        // Add compressed file
        const ext = result.format === "image/jpeg" ? ".jpg" : ".png";
        const filename = file.name.replace(/\.[^.]+$/, "") + ext;
        const compressedFile = new File([result.blob], filename, { type: result.format });
        dataTransfer.items.add(compressedFile);
      }

      // Add PDFs (no compression needed, use placeholder preview)
      for (const file of pdfFiles) {
        previews.push(`pdf:${file.name}`);
        results.push({
          blob: file,
          originalSize: file.size,
          compressedSize: file.size,
          wasCompressed: false,
          format: "application/pdf",
          compressionRatio: 1,
          method: "none",
        });
        dataTransfer.items.add(file);
      }

      setCompressionInfo(results);
      setImagePreviews(previews);
      setSelectedFiles(dataTransfer.files);
    } catch (error) {
      console.error("File processing failed:", error);
      // Fallback to original files
      const dataTransfer = new DataTransfer();
      const previews: string[] = [];

      for (const file of [...imageFiles, ...pdfFiles]) {
        dataTransfer.items.add(file);
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          const previewPromise = new Promise<string>((resolve) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          });
          previews.push(await previewPromise);
        } else {
          previews.push(`pdf:${file.name}`);
        }
      }
      setImagePreviews(previews);
      setSelectedFiles(dataTransfer.files);
    } finally {
      setIsCompressing(false);
    }
  }, [compressionOptions]);

  // Handle file selection from input
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFiles(Array.from(files));
      }
    },
    [processFiles]
  );

  // Handle paste event (Ctrl+V / Cmd+V with images)
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const pasteFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/") || item.type === "application/pdf") {
          const file = item.getAsFile();
          if (file) {
            pasteFiles.push(file);
          }
        }
      }

      if (pasteFiles.length > 0) {
        e.preventDefault();
        processFiles(pasteFiles);
      }
    },
    [processFiles]
  );

  // Handle drop event
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = Array.from(e.dataTransfer.files).filter(
        (f) => f.type.startsWith("image/") || f.type === "application/pdf"
      );

      if (files.length > 0) {
        processFiles(files);
      }
    },
    [processFiles]
  );

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Add paste listener to window
  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  // Remove a selected image
  const removeImage = useCallback((index: number) => {
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    setCompressionInfo((prev) => prev.filter((_, i) => i !== index));

    // Rebuild FileList without the removed file
    setSelectedFiles((current) => {
      if (!current) return current;
      const dataTransfer = new DataTransfer();
      Array.from(current).forEach((f, i) => {
        if (i !== index) dataTransfer.items.add(f);
      });
      if (dataTransfer.files.length === 0) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        return undefined;
      } else {
        return dataTransfer.files;
      }
    });
  }, []);

  // Clear all selected files
  const clearFiles = useCallback(() => {
    setSelectedFiles(undefined);
    setImagePreviews([]);
    setCompressionInfo([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return {
    fileInputRef,
    selectedFiles,
    imagePreviews,
    compressionInfo,
    isCompressing,
    handleFileSelect,
    handleDrop,
    handleDragOver,
    removeImage,
    clearFiles,
  };
}
