import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Creative Generator",
  description: "AI Poster & Thumbnail Studio for public-awareness campaign creatives."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
