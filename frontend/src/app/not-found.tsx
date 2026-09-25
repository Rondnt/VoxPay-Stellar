import { ButtonLink, Card } from "@/components/ui";
export default function NotFound() {
  return (
    <main className="workspace">
      <Card className="state-card">
        <h1>Página no disponible</h1>
        <p>Revisa el enlace e inténtalo de nuevo.</p>
        <ButtonLink href="/pos">Ir al POS</ButtonLink>
      </Card>
    </main>
  );
}
