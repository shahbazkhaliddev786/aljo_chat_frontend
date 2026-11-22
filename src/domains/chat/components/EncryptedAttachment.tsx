"use client";

import { useEffect, useState } from "react";
import { decryptFile } from "@/shared/lib/crypto";
import { AttachmentMeta } from "@/domains/chat/utils/message-crypto";
import { Download, FileLock2 } from "lucide-react";

// Only well-understood raster formats are previewed inline; everything else is a download.
const PREVIEWABLE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const formatSize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Downloads an end-to-end encrypted file, decrypts it in the browser and shows it. */
export default function EncryptedAttachment({ url, meta }: { url: string; meta: AttachmentMeta }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoked = false;
    let created: string | null = null;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const plain = await decryptFile(await res.arrayBuffer(), meta.key, meta.iv);
        if (revoked) return;
        created = URL.createObjectURL(new Blob([plain], { type: meta.mime || "application/octet-stream" }));
        setObjectUrl(created);
      } catch (err) {
        console.error("Failed to decrypt attachment", err);
        if (!revoked) setError(true);
      }
    })();
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url, meta.key, meta.iv, meta.mime]);

  if (error) {
    return <div className="p-2 text-[11px] text-rose-300">Could not decrypt this attachment.</div>;
  }
  if (!objectUrl) {
    return (
      <div className="p-2 text-[11px] text-gray-300 inline-flex items-center gap-1.5">
        <FileLock2 className="w-3.5 h-3.5" /> Decrypting {meta.name}…
      </div>
    );
  }
  if (PREVIEWABLE.has(meta.mime)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={objectUrl} alt={meta.name} className="w-full object-cover" />;
  }
  return (
    <a
      href={objectUrl}
      download={meta.name}
      className="p-2 bg-slate-800 text-indigo-300 flex items-center gap-2 hover:bg-slate-700"
    >
      <Download className="w-4 h-4 shrink-0" />
      <span className="truncate">{meta.name}</span>
      <span className="text-[10px] text-gray-400 shrink-0">{formatSize(meta.size)}</span>
    </a>
  );
}
