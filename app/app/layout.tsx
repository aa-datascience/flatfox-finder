import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flatfox Finder — student housing, automated",
  description:
    "Build a profile, get matched to live Flatfox listings, and contact the right ones first — fully legally.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
