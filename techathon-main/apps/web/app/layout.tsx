import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Multi-Agent Support Engine",
  description: "Multi-agent customer support resolution engine",
};

// Applies the saved theme (defaulting to dark) before first paint so there's no
// flash of the wrong theme on load. Runs inline in <head> ahead of hydration.
const THEME_INIT = `(function(){try{var t=localStorage.getItem("se.theme");if(!t)t="dark";var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.style.colorScheme=t;}catch(e){document.documentElement.classList.add("dark");}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
