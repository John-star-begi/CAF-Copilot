import "./globals.css";

export const metadata = {
  title: "CAF Copilot",
  description: "AI maintenance triage assistant"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

