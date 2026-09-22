export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Ingresar</h1>
        <p className="text-sm text-zinc-500">
          Login de comerciante — JWT emitido por la API (módulo{" "}
          <code>auth</code> del backend).
        </p>
      </div>
    </div>
  );
}
