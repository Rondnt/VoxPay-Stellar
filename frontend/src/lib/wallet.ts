import { Networks, StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import {
  WalletConnectModule,
  WalletConnectTargetChain,
} from "@creit.tech/stellar-wallets-kit/modules/wallet-connect";

// Next.js/Turbopack a veces empaqueta este módulo por separado en cada ruta (POS, wallet, pay),
// dando lugar a instancias de `wallet.ts` distintas dentro de la misma pestaña. Con estado a nivel
// de módulo, cada una llamaba `StellarWalletsKit.init()` (y creaba su propio SignClient de
// WalletConnect) por su cuenta, así que el QR lo generaba una instancia pero la aprobación de
// Freighter mobile le llegaba a otra que nunca pidió esa sesión ("Pending session not found for
// topic ..."). Se guarda el estado en `window`, que sí es único de verdad para toda la pestaña.
declare global {
  interface Window {
    __voxpayWalletKitInitialized?: boolean;
    __voxpayWalletConnectModule?: WalletConnectModule;
  }
}

function ensureInit() {
  if (typeof window === "undefined" || window.__voxpayWalletKitInitialized) return;
  const modules = [new FreighterModule(), new xBullModule()];
  // Sin esto, wallets mobile (Freighter mobile, etc.) no tienen forma de conectarse: no son
  // extensiones de navegador, necesitan el QR/pairing de WalletConnect. Requiere un Project ID
  // gratis de cloud.reown.com; sin la env var, se omite el módulo (solo quedan las extensiones).
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (projectId) {
    const walletConnectModule = new WalletConnectModule({
      projectId,
      allowedChains: [WalletConnectTargetChain.TESTNET],
      metadata: {
        name: "VoxPay",
        description: "POS por voz sobre Stellar",
        url: window.location.origin,
        icons: [`${window.location.origin}/brand/463ac.png`],
      },
    });
    window.__voxpayWalletConnectModule = walletConnectModule;
    modules.push(walletConnectModule);
  }
  StellarWalletsKit.init({
    modules,
    network: Networks.TESTNET,
  });
  window.__voxpayWalletKitInitialized = true;
}

/**
 * `WalletConnectModule` arma su `SignClient`/modal de forma asíncrona dentro del constructor, sin
 * exponer una promesa pública de "listo". Si se abre el selector de wallets antes de que termine,
 * `isAvailable()` da falso y el kit lo trata como wallet no disponible — te manda al link de
 * `productUrl` (walletconnect.com) en vez de abrir el QR. Se espera activamente a que esté listo.
 */
async function waitForWalletConnectReady(timeoutMs = 5000): Promise<void> {
  const walletConnectModule = window.__voxpayWalletConnectModule;
  if (!walletConnectModule) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await walletConnectModule.isAvailable()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function connectWallet(): Promise<string> {
  ensureInit();
  await waitForWalletConnectReady();
  const { address } = await StellarWalletsKit.authModal();
  return address;
}

export async function getConnectedAddress(): Promise<string | null> {
  ensureInit();
  try {
    const { address } = await StellarWalletsKit.getAddress();
    return address;
  } catch {
    return null;
  }
}

export async function assertWallet(expectedAddress: string): Promise<void> {
  ensureInit();
  const [{ address }, { networkPassphrase }] = await Promise.all([
    StellarWalletsKit.getAddress(),
    StellarWalletsKit.getNetwork(),
  ]);
  if (address !== expectedAddress)
    throw new Error(
      "La cuenta de la wallet cambió. Conéctala de nuevo antes de continuar.",
    );
  if (networkPassphrase !== Networks.TESTNET)
    throw new Error("Red incorrecta. Selecciona Stellar Testnet en tu wallet.");
}

export async function signXdr(
  xdr: string,
  expectedAddress: string,
): Promise<string> {
  ensureInit();
  await assertWallet(expectedAddress);
  const { signedTxXdr, signerAddress } =
    await StellarWalletsKit.signTransaction(xdr, {
      networkPassphrase: Networks.TESTNET,
      address: expectedAddress,
    });
  if (signerAddress && signerAddress !== expectedAddress)
    throw new Error("La firma pertenece a otra cuenta.");
  await assertWallet(expectedAddress);
  return signedTxXdr;
}

export async function disconnectWallet(): Promise<void> {
  ensureInit();
  await StellarWalletsKit.disconnect();
}
