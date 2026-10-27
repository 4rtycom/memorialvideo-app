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
  // Favicon / app icons: src/app/favicon.ico, icon.png, apple-icon.png (App Router file conventions)
  // Extra PNG sizes also live in public/favicon-{16,32,48}.png
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
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
