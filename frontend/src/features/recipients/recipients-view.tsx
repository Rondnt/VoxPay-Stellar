"use client";
import { useState, type FormEvent } from "react";
import {
  Button,
  Card,
  EmptyState,
  Footer,
  Loading,
  Notice,
  PageHeading,
} from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { apiClient, ApiError, errorMessage } from "@/services/api-client";
import { shortAddress } from "@/lib/domain";
import type { Recipient } from "@/types/domain";

export function RecipientsView() {
  const { data, loading, error, refresh, setData } =
    useResource<Recipient[]>("/v1/recipients");
  const [editing, setEditing] = useState<Recipient | "new" | null>(null);
  const [deleting, setDeleting] = useState<Recipient | null>(null);
  const [alias, setAlias] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [errors, setErrors] = useState<{ alias?: string; address?: string }>(
    {},
  );
  function edit(recipient: Recipient | "new") {
    setEditing(recipient);
    setAlias(recipient === "new" ? "" : recipient.alias);
    setAddress(recipient === "new" ? "" : recipient.stellarAddress);
    setFailure("");
    setMessage("");
    setErrors({});
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      const { StrKey } = await import("@stellar/stellar-sdk");
      const invalid = {
        alias: !alias.trim()
          ? "Ingresa un alias."
          : (data ?? []).some(
                (r) =>
                  r.alias.toLocaleLowerCase() ===
                    alias.trim().toLocaleLowerCase() &&
                  (editing === "new" || r.id !== editing?.id),
              )
            ? "Este alias ya existe."
            : undefined,
        address: StrKey.isValidEd25519PublicKey(address.trim())
          ? undefined
          : "Ingresa una dirección pública de Stellar válida (G…).",
      };
      setErrors(invalid);
      if (invalid.alias || invalid.address) return;
      const payload = { alias: alias.trim(), stellarAddress: address.trim() };
      const recipient =
        editing === "new"
          ? await apiClient.post<Recipient>("/v1/recipients", payload)
          : await apiClient.patch<Recipient>(
              `/v1/recipients/${editing?.id}`,
              payload,
            );
      setData((current) =>
        editing === "new"
          ? [...(current ?? []), recipient]
          : (current ?? []).map((r) => (r.id === recipient.id ? recipient : r)),
      );
      setEditing(null);
      setMessage(
        "Destinatario guardado. Los cambios se guardaron correctamente.",
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409)
        setErrors({ alias: "Este alias ya existe." });
      else setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setFailure("");
    try {
      await apiClient.delete(`/v1/recipients/${deleting.id}`);
      setData((current) => (current ?? []).filter((r) => r.id !== deleting.id));
      setMessage(
        `${deleting.alias} ya no está en tu agenda. Los pedidos anteriores no cambian.`,
      );
      setDeleting(null);
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Destinatarios"
        description="Guarda los contactos para repartir tus cobros."
      />
      {message && <Notice title="Cambios guardados">{message}</Notice>}
      {editing ? (
        <>
          <div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Volver a destinatarios
            </Button>
          </div>
          <Card className="recipient-form stack">
            <h2>
              {editing === "new"
                ? "Agregar destinatario"
                : "Editar destinatario"}
            </h2>
            <form onSubmit={save} noValidate className="stack">
              <div className="field">
                <label htmlFor="alias">Alias</label>
                <input
                  id="alias"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  maxLength={80}
                  placeholder="Ej.: José"
                  autoFocus
                  disabled={busy}
                  aria-invalid={!!errors.alias}
                  aria-describedby={errors.alias ? "alias-error" : undefined}
                />
                {errors.alias && (
                  <small id="alias-error" className="field-error">
                    {errors.alias}
                  </small>
                )}
              </div>
              <div className="field">
                <label htmlFor="address">Dirección pública de Stellar</label>
                <input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="none"
                  placeholder="Pega la dirección completa"
                  disabled={busy}
                  aria-invalid={!!errors.address}
                  aria-describedby={
                    errors.address ? "address-error" : undefined
                  }
                />
                {errors.address && (
                  <small id="address-error" className="field-error">
                    {errors.address}
                  </small>
                )}
              </div>
              <small>
                No ingreses una clave secreta ni una frase de recuperación.
              </small>
              {failure && <Notice error>{failure}</Notice>}
              <Button type="submit" busy={busy}>
                Guardar destinatario
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                type="button"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </Button>
            </form>
          </Card>
        </>
      ) : deleting ? (
        <Card className="recipient-form stack" aria-labelledby="delete-title">
          <h2 id="delete-title">¿Eliminar a {deleting.alias}?</h2>
          <p>
            Se quitará de tu agenda. Los pedidos ya creados conservarán su
            reparto.
          </p>
          {failure && <Notice error>{failure}</Notice>}
          <div className="row mobile-stack">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Conservar destinatario
            </Button>
            <Button busy={busy} onClick={remove}>
              Eliminar destinatario
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div>
            <Button onClick={() => edit("new")}>Agregar destinatario</Button>
          </div>
          {loading && !data ? (
            <Loading label="Cargando destinatarios" />
          ) : error ? (
            <EmptyState
              title="No pudimos cargar tus destinatarios"
              action={<Button onClick={refresh}>Reintentar</Button>}
            >
              {errorMessage(error)}
            </EmptyState>
          ) : data?.length ? (
            <div className="two-columns">
              {data.map((r) => (
                <Card key={r.id} className="recipient-card">
                  <h2>{r.alias}</h2>
                  <p title={r.stellarAddress}>
                    {shortAddress(r.stellarAddress)}
                  </p>
                  <small>Wallet Stellar</small>
                  <div className="row">
                    <Button variant="secondary" onClick={() => edit(r)}>
                      Editar
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setDeleting(r);
                        setFailure("");
                        setMessage("");
                      }}
                    >
                      Eliminar
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState title="Aún no tienes destinatarios">
              Agrega un alias y su wallet para repartir tus cobros por voz.
            </EmptyState>
          )}
          <p>Usa el alias al dictar un cobro: «reparte 5 USDC a José».</p>
        </>
      )}
      <Footer />
    </>
  );
}
