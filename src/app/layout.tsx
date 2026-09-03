import type { Metadata } from "next";
import type { ReactNode } from "react";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "MASIL — 말로 여는 생활 공간",
  description:
    "혼자 사는 어르신이 말로 창작하고 대화하며 도움의 창구를 여는 WebMCP 경험",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
