import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Press_Start_2P } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/auth";
import { DEFAULT_THEME, isValidTheme, themeMode, THEME_ACCENT } from "@/lib/themes";
import "./globals.css";

async function resolveTheme() {
  const cookieStore = await cookies();
  const rawTheme = cookieStore.get(THEME_COOKIE)?.value;
  return isValidTheme(rawTheme) ? rawTheme : DEFAULT_THEME;
}

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const pressStart = Press_Start_2P({
  variable: "--font-press-start",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "DM Notes",
  description: "A self-hosted, chat-style note capture app",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DM Notes",
  },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = await resolveTheme();
  return { themeColor: THEME_ACCENT[theme] };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await resolveTheme();
  const mode = themeMode(theme);

  return (
    <html
      lang="en"
      data-app-theme={theme}
      data-mode={mode}
      className={`${plexSans.variable} ${plexMono.variable} ${pressStart.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
