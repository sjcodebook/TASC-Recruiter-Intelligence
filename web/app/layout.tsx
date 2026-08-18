import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TASC Match Intelligence",
  description: "Evidence-led candidate and role matching for in-house recruiters."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

