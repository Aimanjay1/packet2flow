import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <>
    <header>
      <div className={`flex flex-1 flex-col bg-surface text-ink`}>
      {/* Header / TopAppBar */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-b-3xl bg-surface px-6 py-4 shadow-neu">
        <Link href="/" className="shrink-0 text-xl leading-7 font-semibold text-brand">
          Packet2Flow
        </Link>

        {/* Search */}
        <div className="max-w-124 min-w-0 flex-1 px-6">
          <label className="flex items-center rounded-full bg-surface px-4 py-2 shadow-neu-inset focus-within:ring-2 focus-within:ring-brand/40">
            <Image src="/home/icon-search.svg" alt="" width={26} height={18} className="shrink-0" />
            <span className="sr-only">Search captures</span>
            <input
              type="search"
              placeholder="Search captures..."
              className="min-w-0 flex-1 bg-transparent py-px text-sm text-ink outline-none placeholder:text-ink-muted/70"
            />
          </label>
        </div>

        {/* Log Out */}
        <Link
          href="/login"
          className="flex w-46.5 shrink-0 items-center justify-center gap-2 rounded-2xl bg-surface px-6 py-4 text-base leading-6 font-semibold text-brand shadow-neu transition-shadow active:shadow-neu-inset"
        >
          Log Out
          <Image src="/home/icon-sign-out.svg" alt="" width={24} height={24} />
        </Link>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-4">
          <Link
            href="#"
            aria-label="Settings"
            className="flex items-center justify-center rounded-full bg-surface p-2 shadow-neu active:shadow-neu-inset"
          >
            <Image src="/home/icon-settings.svg" alt="" width={20.1} height={20} />
          </Link>
          <Link
            href="#"
            aria-label="Profile"
            className="flex items-center justify-center rounded-full bg-surface p-2 shadow-neu active:shadow-neu-inset"
          >
            <Image src="/home/icon-user.svg" alt="" width={20} height={20} />
          </Link>
          <button
            type="button"
            aria-label="Notifications (unread)"
            className="relative flex cursor-pointer items-center justify-center p-3 shadow-neu active:shadow-neu-inset"
          >
            <Image src="/home/icon-bell.svg" alt="" width={16} height={20} />
            <span className="absolute top-2 right-2 size-2.5 rounded-full bg-danger ring-2 ring-surface" />
          </button>
        </div>
      </header>

      {/* Main canvas */}
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl leading-8 font-semibold">New Analysis</h2>
          <p className="text-sm leading-5 text-ink-muted">
            Upload a network capture file to begin inspection.
          </p>
        </div>

        {/*<UploadPanel />*/}
      </main>
    </div>
    </header>
    </>
  );
}
