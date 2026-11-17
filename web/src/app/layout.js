import "./globals.css";
import Shell from "@/components/Shell";

export const metadata = {
  title: "AI-Powered Smart Meter of the Future",
  description: "Electricity monitoring, forecasting, anomaly detection and energy-saving advice.",
};
export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
