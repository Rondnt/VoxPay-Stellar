import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-16 text-center">
      <h1 className="text-3xl font-semibold">VoxPay</h1>
      <p className="max-w-md text-zinc-500">
        POS inteligente por voz sobre Stellar. Habla, cobra y reparte en
        segundos.
      </p>
      <Link
        href="/login"
        className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background"
      >
        Ingresar
      </Link>
    </div>
  );
}
