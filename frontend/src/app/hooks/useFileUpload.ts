'use client';
import { useState, useCallback, useRef } from 'react';
import { Attachment } from '@/app/lib/types';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — matches backend multer limit

function isImageFile(filename: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(filename);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface UploadResponse {
  success: boolean;
  filename: string;
  storedFilename?: string;
  path: string;
  size: number;
  mimeType: string;
  url: string;
  publicUrl?: string | null;
  isText?: boolean;
  isImage?: boolean;
  isPdf?: boolean;
  isExcel?: boolean;
  isCsv?: boolean;
  extractedText?: string | null;
  addedToKnowledgeBase?: boolean;
}

export function useFileUpload() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File): Promise<Attachment | null> => {
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large: ${file.name} (max 50MB)`);
      return null;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/upload/multipart', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Upload failed (HTTP ${res.status})`);
      }

      const data: UploadResponse = await res.json();
      const isImage = isImageFile(file.name) || !!data.isImage;
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined;

      const attachment: Attachment = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: isImage ? 'image' : 'file',
        filename: file.name,
        mimeType: file.type || data.mimeType || 'application/octet-stream',
        size: file.size,
        previewUrl,
        storagePath: data.path,
      };

      return attachment;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    const uploaded: Attachment[] = [];

    for (const file of fileArr) {
      const att = await uploadFile(file);
      if (att) uploaded.push(att);
    }

    setAttachments(prev => [...prev, ...uploaded]);
    return uploaded;
  }, [uploadFile]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments(prev => {
      prev.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
      return [];
    });
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    e.target.value = '';
  }, [addFiles]);

  return {
    attachments,
    uploading,
    error,
    fileInputRef,
    addFiles,
    removeAttachment,
    clearAttachments,
    openFilePicker,
    handleFileInputChange,
  };
}

export { formatFileSize, isImageFile };
