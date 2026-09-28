import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { ActionFlash } from "@/components/action-flash";
import { BuildWatch } from "@/components/build-watch";
import { BUILD_ID } from "@/lib/build-id";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIM Command Center",
  description:
    "Programme, assessment and credential administration with server-enforced authority.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No attribute for "system": the stylesheet then follows the OS. See lib/theme.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="en" data-theme={theme === "system" ? undefined : theme}>
      <body className="font-sans antialiased">
        {/* The result of the last form submit, whichever page it was on. */}
        <Suspense fallback={null}>
          <div className="px-4">
            <ActionFlash />
          </div>
        </Suspense>
        {children}
        {/* Says so when a deploy has left this tab behind. */}
        <BuildWatch id={BUILD_ID} />
      </body>
    </html>
  );
}
