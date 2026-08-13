import type { HeatColor } from "../types";


interface Props {
  label: string;
  tone?: HeatColor | "amber";
}

export default function StatusMark({ label, tone = "amber" }: Props) {
  return (
    <span className={`status-mark status-mark--${tone}`}>
      <span className="status-mark__shape" aria-hidden="true" />
      {label}
    </span>
  );
}
