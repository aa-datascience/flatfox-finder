export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <span className="text-sm font-medium uppercase tracking-widest text-orange-600">
        Scaffold ready
      </span>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Student housing search, automated.
      </h1>
      <p className="text-lg text-neutral-600">
        Build a profile once. We continuously match you against live Flatfox
        listings with a two-layer engine and draft a personal contact message for
        every strong match — so you&apos;re first to the right places, fully legally.
      </p>
      <div className="flex gap-3">
        <a
          href="/signup"
          className="rounded-md bg-orange-600 px-5 py-2.5 font-medium text-white hover:bg-orange-700"
        >
          Get started
        </a>
        <a
          href="/login"
          className="rounded-md border border-neutral-300 px-5 py-2.5 font-medium hover:bg-neutral-50"
        >
          Log in
        </a>
      </div>
      <p className="mt-8 text-sm text-neutral-400">
        Monorepo scaffold — Next.js app + Python worker + Postgres/Redis. Next up:
        DB schema (Task #2).
      </p>
    </main>
  );
}
