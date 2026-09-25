import { Networks, StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";

let initialized = false;

function ensureInit() {
  if (initialized) return;
  StellarWalletsKit.init({
    modules: [new FreighterModule(), new xBullModule()],
    network: Networks.TESTNET,
  });
  initialized = true;
}

export async function connectWallet(): Promise<string> {
  ensureInit();
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
