import { Activity, AlertCircle, CheckCircle2 } from "lucide-react";

type Props = {
  status: string;
  error?: string;
  connected: boolean;
};

export default function StatusBanner({ status, error, connected }: Props) {
  return (
    <div className="status-banner">
      <div className="status-left">
        {error ? (
          <AlertCircle size={18} />
        ) : connected ? (
          <CheckCircle2 size={18} />
        ) : (
          <Activity size={18} />
        )}
        <span>{error || status}</span>
      </div>
      <div className={`pill ${connected ? "pill-success" : "pill-neutral"}`}>
        {connected ? "Connected" : "Waiting"}
      </div>
    </div>
  );
}