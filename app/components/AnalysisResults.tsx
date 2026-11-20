import type { AnalysisJob, FileResult, Flag } from "../lib/useAnalysis";

// One colour per flag, using the colours already defined in globals.css.
const FLAG_STYLES: Record<Flag, string> = {
  clean: "bg-success/15 text-success-strong",
  suspicious: "bg-warning/25 text-ink-strong",
  malicious: "bg-danger-soft text-danger-strong",
};

function FlagBadge({ flag }: { flag: Flag }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs leading-4 font-semibold uppercase ${FLAG_STYLES[flag]}`}
    >
      {flag}
    </span>
  );
}

// The right-hand side of one row: the flag when finished, otherwise the progress.
function FileStatus({ file }: { file: FileResult }) {
  if (file.status === "error") {
    return <span className="shrink-0 text-danger">{file.error ?? "Scan failed"}</span>;
  }
  if (file.status !== "done" || !file.flag) {
    return (
      <span className="shrink-0 text-ink-muted">
        {file.status === "scanning" ? "Scanning..." : "Waiting"}
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-3">
      <span className="text-ink-muted">
        {file.malicious ?? 0} malicious · {file.suspicious ?? 0} suspicious
      </span>
      <FlagBadge flag={file.flag} />
      {file.permalink && (
        <a
          href={file.permalink}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-brand underline"
        >
          Report
        </a>
      )}
    </span>
  );
}

export default function AnalysisResults({ job }: { job: AnalysisJob }) {
  const finished = job.files.filter((f) => f.status === "done" || f.status === "error").length;

  return (
    <div className="mt-6 rounded-3xl bg-surface p-6 shadow-neu" aria-live="polite">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg leading-7 font-semibold text-ink-strong">VirusTotal results</h3>
          <p className="text-sm leading-5 text-ink-muted">
            {finished} of {job.files.length} scanned
          </p>
        </div>
        {job.status === "done" && job.overall && <FlagBadge flag={job.overall} />}
      </div>
      <ul className="flex flex-col gap-3">
        {job.files.map((file, i) => (
          <li key={i} className="flex items-center justify-between gap-4 text-sm leading-5">
            <span className="min-w-0 truncate font-medium text-ink-strong">{file.name}</span>
            <FileStatus file={file} />
          </li>
        ))}
      </ul>
    </div>
  );
}
