import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth-options";

const STEPS = [
  {
    title: "Tell us what you want",
    body: "Set your budget, cities, move-in date and the lifestyle that fits you — or just describe it in your own words and let AI fill in the rest.",
  },
  {
    title: "We match every listing",
    body: "We continuously scan Flatfox and score each home against your profile, so the best fits rise to the top instead of you scrolling for hours.",
  },
  {
    title: "Reach out in one click",
    body: "Open any match and get a warm, ready-to-send message drafted in the listing's language. Copy it, open Flatfox, and you're done.",
  },
];

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-white">
      {/* Top bar */}
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-9 w-9 object-contain" />
          <span className="text-lg font-semibold tracking-tight text-gray-900">
            Flatfox<span className="text-brand-600">Finder</span>
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            Log in
          </Link>
          <Link href="/signup" className="btn-primary">
            Sign up
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <div className="mx-auto max-w-5xl px-4">
        <section className="py-16 text-center sm:py-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
            AI-powered housing matching for Switzerland
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-gray-900 sm:text-5xl">
            Find your student home{" "}
            <span className="text-brand-600">without the endless scrolling</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
            Tell us your budget, where you want to live, and how you like to live.
            We rank every Flatfox listing for you and draft the first message —
            so you spend minutes, not weekends, looking.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="btn-primary px-6 py-2.5 text-base">
              Get started — it&apos;s free
            </Link>
            <Link href="/login" className="btn-secondary px-6 py-2.5 text-base">
              I already have an account
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-400">
            No credit card. Your data is processed per our{" "}
            <Link href="/privacy" className="underline hover:text-gray-600">
              privacy policy
            </Link>
            .
          </p>
        </section>

        {/* How it works */}
        <section className="pb-20">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-gray-500">
            How it works
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="card p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                  {i + 1}
                </div>
                <h3 className="mt-4 font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-gray-500 sm:flex-row">
          <span>© {new Date().getFullYear()} FlatfoxFinder</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-gray-700">
              Privacy
            </Link>
            <Link href="/login" className="hover:text-gray-700">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-gray-700">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
