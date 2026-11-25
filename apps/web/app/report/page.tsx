"use client";

import dynamic from "next/dynamic";

// The signing path pulls in @stellar/stellar-sdk and the wallet kit. Load it
// only once the form mounts, so the page shell is in the first bundle and
// paints immediately.
const ReportForm = dynamic(() => import("./ReportForm"), {
  ssr: false,
  loading: () => <FormSkeleton />,
});

export default function ReportPage() {
  return (
    <>
      <div className="eyebrow">For issuers, auditors and transcribers</div>
      <h1>Post a reserve report</h1>
      <p className="sub" style={{ maxWidth: 680 }}>
        Your account decides the weight of the report. The asset&apos;s issuer account posts at the
        Issuer-signed tier. Registered auditors post at Auditor-signed, registered transcribers at
        Transcribed. Anyone else is refused by the contract.
      </p>
      <ReportForm />
    </>
  );
}

function FormSkeleton() {
  return (
    <div
      className="mt"
      aria-busy="true"
      aria-label="Loading the report form"
      style={{ maxWidth: 680 }}
    >
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <Bar height={24} width="40%" />
        <Bar height={14} width="70%" />
      </div>
      <div className="mt" style={{ display: "grid", gap: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "grid", gap: 6 }}>
            <Bar height={14} width="22%" />
            <Bar height={42} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ height, width = "100%" }: { height: number; width?: string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}
