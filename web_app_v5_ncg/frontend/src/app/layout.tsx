import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI4BI",
  description: "AI Learning Web App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
