"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";

const ACCEPTED_EXTENSIONS = [".pcap", ".cap", ".pcapng"];
const MB = 1024 * 1024;
const FILE_LIMIT = 500 * MB;
const FOLDER_LIMIT = 2 * 1024 * MB;

type Selection = { kind: "file" | "folder"; files: File[] };

function isCapture(file: File) {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Walk a dropped folder (and its subfolders) and collect every file in it.
async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) =>
      (entry as FileSystemFileEntry).file((f) => resolve([f]), reject),
    );
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  // readEntries returns results in batches, so keep reading until it's empty.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    children.push(...batch);
  }
  return (await Promise.all(children.map(readEntry))).flat();
}

async function filesFromDrop(e: DragEvent): Promise<File[]> {
  const entries = Array.from(e.dataTransfer.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (entries.length === 0) return Array.from(e.dataTransfer.files);
  return (await Promise.all(entries.map(readEntry))).flat();
}

type DropCardProps = {
  title: string;
  limit: string;
  icon: React.ReactNode;
  buttonIcon: React.ReactNode;
  buttonLabel: string;
  buttonClassName: string;
  status: React.ReactNode;
  onBrowse: () => void;
  onDropFiles: (files: File[]) => void;
};

function DropCard({
  title,
  limit,
  icon,
  buttonIcon,
  buttonLabel,
  buttonClassName,
  status,
  onBrowse,
  onDropFiles,
}: DropCardProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragging(false);
        onDropFiles(await filesFromDrop(e));
      }}
      className={`flex flex-col items-center rounded-3xl border-2 border-dashed bg-surface px-6 py-11.5 shadow-neu-inset transition-colors ${
        dragging ? "border-brand/60" : "border-[rgba(208,210,220,0.3)]"
      }`}
    >
      <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-surface shadow-neu">
        {icon}
      </div>
      <h3 className="mb-2 text-center text-xl leading-7 font-semibold text-ink-strong">{title}</h3>
      {/* Once something is picked (or rejected), the hint line shows that instead. */}
      <p className="mb-6 text-center text-sm leading-5 text-ink" aria-live="polite">
        {status ?? (
          <>
            Supports .pcap, .cap, and .pcapng up to{" "}
            <span className="font-bold text-brand">{limit}</span>.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={onBrowse}
        className={`flex h-12 cursor-pointer items-center gap-2 rounded-3xl bg-surface py-3 text-base leading-6 font-semibold text-brand shadow-neu transition-shadow active:shadow-neu-inset ${buttonClassName}`}
      >
        {buttonIcon}
        {buttonLabel}
      </button>
    </div>
  );
}

export default function UploadPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<{ kind: Selection["kind"]; message: string } | null>(null);

  function select(kind: Selection["kind"], incoming: File[]) {
    const files = incoming.filter(isCapture);
    const limit = kind === "file" ? FILE_LIMIT : FOLDER_LIMIT;
    const total = files.reduce((sum, f) => sum + f.size, 0);

    if (files.length === 0) {
      setError({ kind, message: "No .pcap, .cap or .pcapng files found." });
    } else if (kind === "file" && files.length > 1) {
      setError({ kind, message: "Drop one capture file, or use the folder option." });
    } else if (total > limit) {
      setError({ kind, message: `Too large (${formatSize(total)}). Limit is ${formatSize(limit)}.` });
    } else {
      setError(null);
      setSelection({ kind, files });
      return;
    }
    setSelection(null);
  }

  function statusFor(kind: Selection["kind"]) {
    if (error?.kind === kind) return <span className="text-danger">{error.message}</span>;
    if (selection?.kind !== kind) return null;
    const total = selection.files.reduce((sum, f) => sum + f.size, 0);
    const label =
      kind === "file" ? selection.files[0].name : `${selection.files.length} capture files`;
    return (
      <span className="font-semibold text-ink-strong">
        {label} · {formatSize(total)}
      </span>
    );
  }

  return (
    <section className="mt-8.5 flex flex-col gap-2.5">
      <div className="grid gap-9 md:grid-cols-2">
        <DropCard
          title="Drag & Drop PCAP File"
          limit="500MB"
          icon={<Image src="/icons/file-upload.svg" alt="" width={24} height={30} />}
          buttonIcon={<Image src="/icons/folder.svg" alt="" width={24} height={24} />}
          buttonLabel="Browse Files"
          buttonClassName="px-2.5"
          status={statusFor("file")}
          onBrowse={() => fileInput.current?.click()}
          onDropFiles={(files) => select("file", files)}
        />
        <DropCard
          title="Drag & Drop PCAP Folder"
          limit="2GB"
          icon={<Image src="/icons/folder.svg" alt="" width={24} height={24} />}
          buttonIcon={<Image src="/icons/folder-open.svg" alt="" width={22} height={16} />}
          buttonLabel="Browse Folder"
          buttonClassName="px-6"
          status={statusFor("folder")}
          onBrowse={() => folderInput.current?.click()}
          onDropFiles={(files) => select("folder", files)}
        />
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(e) => {
          select("file", Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        className="hidden"
        {...{ webkitdirectory: "" }}
        onChange={(e) => {
          select("folder", Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {/* Actions */}
      <div className="flex justify-end">
        <Link
          href="#"
          className="flex h-12 items-center rounded-3xl bg-brand px-8 py-3 text-base leading-6 font-semibold text-white shadow-neu transition-colors hover:bg-brand-hover"
        >
          Overview
        </Link>
        <button
          type="button"
          disabled={!selection}
          onClick={() => {
            // TODO: send `selection.files` to the analysis backend.
          }}
          className="flex h-12 cursor-pointer items-center gap-2 rounded-3xl bg-surface px-8 py-3 text-base leading-6 font-semibold text-brand shadow-neu transition-shadow active:shadow-neu-inset disabled:cursor-not-allowed disabled:text-ink/50 disabled:shadow-neu-inset"
        >
          <Image src="/icons/play.svg" alt="" width={11} height={14} />
          Start Analysis
        </button>
      </div>
    </section>
  );
}
