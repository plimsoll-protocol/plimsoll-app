import ReporterAnalyticsClient from "./ReporterAnalyticsClient";

export function generateStaticParams() {
  // Provide a placeholder address for static generation.
  // Client-side routing will handle other addresses at runtime.
  return [{ address: "GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNO" }];
}

export default function ReporterAnalyticsPage({ params }: { params: { address: string } }) {
  return <ReporterAnalyticsClient address={params.address} />;
}