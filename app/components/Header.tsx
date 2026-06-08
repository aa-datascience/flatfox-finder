"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Matches" },
  { href: "/settings", label: "Settings" },
];

export default function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="FlatfoxFinder"
            className="h-9 w-9 object-contain"
          />
          <span className="text-lg font-semibold tracking-tight text-gray-900">
            Flatfox<span className="text-brand-600">Finder</span>
          </span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          <div className="ml-3 h-6 w-px bg-gray-200" />

          {/* User menu */}
          <div className="ml-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {session.user?.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-gray-500 transition-colors hover:text-gray-700"
            >
              Log out
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
