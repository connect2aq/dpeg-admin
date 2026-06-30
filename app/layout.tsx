import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

const isStaging = process.env.NEXT_PUBLIC_ENV === "staging";
// const isStaging = true;

export const metadata: Metadata = {
  title: isStaging ? "DPEG Admin Portal (Staging)" : "DPEG Admin Portal",
  description: "Administration portal for DPEG Real Estate Fund",
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/favicon.svg`,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex flex-col">
        <Providers>
          {isStaging && (
            <div className="bg-amber-500 text-amber-950 text-center py-2 font-bold text-sm tracking-wider uppercase flex-shrink-0 z-50 shadow-md">
              This is a Testing Portal
            </div>
          )}
          <div className="flex-1 min-h-0">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
