"use client";

import { useSession } from "next-auth/react";

export default function DashboardPage() {
  const { data: session } = useSession();

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <p className="text-gray-600">
        Welcome{session?.user?.name ? `, ${session.user.name}` : ""}! Your
        matches will appear here.
      </p>
      <p className="mt-4 text-sm text-gray-500">
        We&apos;re searching — matches appear within a few hours.
      </p>
    </main>
  );
}
