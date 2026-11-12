import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";

// Display serif for marketing headings only; the app UI stays in Geist.
const serif = localFont({
  src: [
    { path: "../fonts/instrument-serif-latin-400-normal.woff2", style: "normal", weight: "400" },
    { path: "../fonts/instrument-serif-latin-400-italic.woff2", style: "italic", weight: "400" },
  ],
  variable: "--font-instrument",
  display: "swap",
});
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ApplyFlow", template: "%s · ApplyFlow" },
  description: "Track every job application, interview and follow-up in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${serif.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
