"use client";
import { Button, Card } from "@/components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="workspace">
      <Card className="state-card">
        <h1>Algo salió mal</h1>
        <p>No pudimos mostrar esta pantalla. Tus datos no se han modificado.</p>
        <Button onClick={reset}>Reintentar</Button>
      </Card>
    </main>
  );
}
