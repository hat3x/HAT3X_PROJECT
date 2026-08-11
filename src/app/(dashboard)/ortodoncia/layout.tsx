import { SectorGate } from "@/components/guards/sector-gate";

export default function OrtodonciaLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <SectorGate required="odontologia">{children}</SectorGate>;
}
