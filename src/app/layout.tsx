import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inspot — панель управления инфраструктурой",
  description:
    "Панель оператора для серверов, доменов, мониторинга, бэкапов и оповещений.",
};

// Slice 1 ships dark theme only (design.md §2.3/§2.4, coordinator decision) — the
// `dark` class is applied unconditionally here; no theme toggle in this slice.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/remixicon/4.5.0/remixicon.min.css"
        />
      </head>
      <body className="antialiased">
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
