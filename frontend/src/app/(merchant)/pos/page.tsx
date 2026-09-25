import { PosView } from "@/features/voice/pos-view";
export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  return <PosView initialOrderId={(await searchParams).order} />;
}
