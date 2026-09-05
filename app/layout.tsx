import type { Metadata } from "next";
import "./globals.css";
import "./admin.css";
import "./price.css";
import "./reviews.css";

export const metadata: Metadata = {
  title: "Ink Noir Tattoo Studio",
  description: "Custom tattoos, transparent deposits, appointment booking and live support.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
