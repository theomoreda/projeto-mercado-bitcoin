CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"privy_user_id" text NOT NULL,
	"email" text NOT NULL,
	"wallet_address" text,
	"available_cents" bigint NOT NULL,
	"reserved_cents" bigint DEFAULT 0 NOT NULL,
	"excess_micro" bigint DEFAULT 0 NOT NULL,
	"initial_micro" bigint NOT NULL,
	"last_scanned_block" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_privyUserId_unique" UNIQUE("privy_user_id"),
	CONSTRAINT "accounts_walletAddress_unique" UNIQUE("wallet_address"),
	CONSTRAINT "available_non_negative" CHECK ("accounts"."available_cents" >= 0),
	CONSTRAINT "reserved_non_negative" CHECK ("accounts"."reserved_cents" >= 0),
	CONSTRAINT "excess_below_one_cent" CHECK ("accounts"."excess_micro" >= 0 AND "accounts"."excess_micro" < 10000)
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"amount_micro" bigint NOT NULL,
	"status" text DEFAULT 'PROCESSANDO' NOT NULL,
	"tx_hash" text,
	"client_request_id" text,
	"nonce" bigint,
	"raw_tx" text,
	"failure_reason" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transfers_txHash_unique" UNIQUE("tx_hash"),
	CONSTRAINT "transfers_clientRequestId_unique" UNIQUE("client_request_id"),
	CONSTRAINT "amount_non_negative" CHECK ("transfers"."amount_micro" >= 0),
	CONSTRAINT "direction_valid" CHECK ("transfers"."direction" IN ('MB_TO_WALLET', 'WALLET_TO_MB')),
	CONSTRAINT "status_valid" CHECK ("transfers"."status" IN ('PROCESSANDO', 'CONFIRMADA', 'FALHOU'))
);
--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;