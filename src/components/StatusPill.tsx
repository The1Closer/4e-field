type Props = {
  value: string;
};

export function StatusPill({ value }: Props) {
  const normalized = value.toLowerCase();

  let className = "pill";
  if (normalized === "completed" || normalized === "read") className = "pill pill-green";
  if (normalized === "open" || normalized === "unread") className = "pill pill-amber";

  return <span className={className}>{value}</span>;
}
