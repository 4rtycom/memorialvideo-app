import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";

const dm = DM_Sans({
  variable: "--font-dm",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "MemorialVideo Creator",
  description:
    "A calm, ceremony-first memorial video creator. AI does the heavy work. Families make the meaningful decisions.",
  applicationName: "MemorialVideo",
  // Exact same App Router icon files as memorialvideo marketing:
  // src/app/favicon.ico, icon.svg, apple-icon.png (byte-identical).
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${dm.variable} ${cormorant.variable} antialiased`}>{children}</body>
    </html>
  );
}
