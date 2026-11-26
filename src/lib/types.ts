import type { Direction, Status } from "../db/schema.ts";

/** Formatos JSON de /api (bigint chega como string). */
export type MeView = {
  email: string;
  account: { availableCents: string; reservedCents: string };
  wallet: null | { address: string; balanceMicro: string };
};

export type TransferView = {
  id: string;
  direction: Direction;
  status: Status;
  amountMicro: string;
  txHash: string | null;
  failureReason: string | null;
  confirmations: string | null;
};
