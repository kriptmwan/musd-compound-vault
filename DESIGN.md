# DESIGN.md — MUSD Compound Vault (Mezo Buildathon, Track 1 DeFi)

## 1. Product

**Name:** MUSD Compound Vault
**One-sentence pitch:** Deposit MUSD, get cMUSD shares, and earn Mezo's own
MUSD Savings Rate yield — auto-compounded, with instant withdrawals.
**What it does:** an ERC-4626 vault on Mezo whose only yield source is
Mezo's native sMUSD vault. Users deposit MUSD; the vault keeps a 10% MUSD
buffer for instant redemptions and invests the rest into sMUSD. Anyone can
call `compound()` to claim the vault's accrued sMUSD yield and re-deposit
it, so yield earns yield. Share price rises only on realised, measured MUSD.
**Who it is for:** MUSD holders on Mezo who want savings yield without
manually claiming, and other Mezo DeFi apps that want a composable,
ERC-4626 yield-bearing MUSD token (cMUSD) instead of raw sMUSD.
**Why it is a real product:** sMUSD yield must be claimed manually and is
not composable as an ERC-4626 asset. The vault automates claiming +
re-depositing and wraps the position in the standard vault interface every
aggregator, wallet and DeFi protocol already understands.

## 2. What was verified live (2026-11-14, read-only)

All of the below was verified by direct public-RPC reads
(`eth_chainId`, `eth_getCode`, `eth_call`) — no transactions, no signing.

### Networks

| Network | Chain ID | RPC | Explorer | Gas token |
|---|---|---|---|---|
| Mezo testnet | 31611 | https://rpc.test.mezo.org | https://explorer.test.mezo.org | BTC |
| Mezo mainnet | 31612 | https://mainnet.mezo.public.validationcloud.io | https://explorer.mezo.org | BTC |

### Core contracts (official Mezo docs + independent Doji integration docs agree)

| Contract | Testnet (31611) | Mainnet (31612) |
|---|---|---|
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` | `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186` |
| sMUSD (MUSDSavingsRate) | `0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16` | `0xb4D498029af77680cD1eF828b967f010d06C51CC` |
| TroveManager | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` | `0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193` |
| PriceFeed (`fetchPrice`) | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` | `0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88` |
| Router (pools) | `0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9` (factory `0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A`) | not used by this product |
| veBTC | `0xB63fcCd03521Cf21907627bd7fA465C129479231` | `0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279` |
| MEZO token (Mezo chain) | `0x7B7c000000000000000000000000000000000001` (precompile-style, per official docs) | same |
| MEZO token (Ethereum/Base/BSC) | `0x8e4cbBcc33dB6c0a18561fDE1F6bA35906d4848b` | same |

### Live state at verification time

- **Testnet** (block 16,774,483): MUSD "Mezo USD", 18 decimals,
  totalSupply 523,974,892.16. sMUSD "MUSD Savings Rate", 18 decimals,
  totalSupply 910,196.88. `sMUSD.musdToken()` == testnet MUSD address
  (match). `sMUSD.yieldIndex()` = 163153975779767529769.
  PriceFeed `fetchPrice()` ≈ $67,120.20 (BTC).
- **Mainnet** (block 13,221,666): MUSD totalSupply 18,988,941.84. sMUSD
  totalSupply 1,356,020.94. `musdToken()` match. `yieldIndex()` =
  218684547038047611. PriceFeed ≈ $67,088.70.
- Code present at every address above. MUSD bytecode ~6,437 bytes;
  sMUSD / TroveManager / PriceFeed / veBTC are 1,159-byte proxies
  (official docs: "All addresses are proxy contracts"); Router is a
  18,209-byte implementation.
- Selector existence (static `eth_call` from an empty account):
  `sMUSD.deposit(uint256)` and `withdraw(uint256)` revert with specific
  custom errors (`0xfb8f41b2…`, `0xf4d678b8`) — i.e. the calls reach live
  logic (allowance/balance checks), they do not hit a missing function.
  `claimYield()` succeeds from an empty account (no-op with no yield).

### sMUSD mechanics (official Mezo docs + Halborn audit, Jan 2026)

- Deposit MUSD → receive sMUSD 1:1. Withdraw sMUSD → receive the same
  amount of MUSD principal. Accrued yield is paid separately by
  `claimYield()`. Yield comes from MUSD protocol fees (lending interest,
  origination, refinancing) plus BTC fees converted to MUSD, distributed
  weekly. No withdrawal fee, no withdrawal time-lock.
- `yieldIndex()` is the cumulative MUSD yield per 1 sMUSD (1e18 scale).
  Transferring sMUSD settles the sender's accrued yield first.
- The vault enforces a **minimum deposit duration** (Halborn 7.1 fix for
  flash-loan yield manipulation). This product's sMUSD position is
  long-lived by design and redemptions are served from the buffer, so
  normal use never churns it — but the exact min-duration value and
  per-lot behaviour are **unverified** and must be confirmed on a Mezo
  testnet fork before mainnet use (see §6).
- MEZO token on the Mezo chain lives at a precompile-style address and
  the ve(3,3) gauge system is complex; this product deliberately does
  **not** depend on MEZO or gauges — MUSD-only integration, verified
  end to end.

### What was deliberately NOT used

- TroveManager / BorrowerOperations (BTC-backed borrowing): real, but
  opening troves needs sorted-list hints and liquidation management —
  too much for a 1-day prototype and unnecessary for this product.
- Router / pools (MUSD↔BTC swaps): real on testnet, but no swap is
  needed for a pure savings vault.
- veBTC / gauges / MEZO emissions: real, but testnet runs an older
  veBTC and gauge addresses/flows were not verified to the same
  standard. Not a dependency.

## 3. Architecture

```
User ── MUSD ──▶ MusdCompoundVault (ERC-4626, cMUSD shares)
                     │ 10% buffer stays as idle MUSD
                     │ 90% ──▶ sMUSD (Mezo MUSDSavingsRate)
                     │          ▲ yield accrues (weekly fee distribution)
                     │ compound() ── claimYield() ──▶ re-deposit
                     └─ withdraw: buffer first → claimYield → withdraw principal
```

### Contracts

| File | What it is |
|---|---|
| `contracts/MusdCompoundVault.sol` | Core vault. ERC4626 + ReentrancyGuard + Ownable + Pausable. |
| `contracts/interfaces/ISMUSD.sol` | Minimal sMUSD interface (`deposit`, `withdraw`, `claimYield`, `yieldIndex`, `musdToken`, ERC20). |
| `contracts/mocks/MockMUSD.sol` | Test-only mintable MUSD. |
| `contracts/mocks/MockSMUSD.sol` | Test-only sMUSD modelling the documented semantics (1:1 deposit/withdraw, index-based claimable yield, transfer settles sender yield). |

### Flows

- **Deposit / mint:** user MUSD is pulled in, shares minted at the
  current price, idle MUSD above the 10% buffer target is invested into
  sMUSD in the same transaction.
- **Compound (permissionless):** `claimYield()` → take the configured
  performance fee (default 0, max 10% of harvested yield) → invest the
  rest into sMUSD. No-op when nothing accrued. Anyone may call it; it
  can only move the vault's own yield.
- **Withdraw / redeem:** served from idle MUSD first. If short, the
  vault claims yield first, then withdraws principal from sMUSD
  (1 sMUSD = 1 MUSD principal). Yield is never left behind: it is
  claimed before any sMUSD withdrawal.
- **Admin:** owner can set buffer (max 50%), performance fee (max 10%),
  fee recipient, and pause *deposits*. Withdrawals can never be paused
  and the owner cannot move user funds.

### Accounting rule (deliberate)

`totalAssets()` = idle MUSD + sMUSD principal only. Unclaimed sMUSD
yield is **not** counted until `compound()` realises it. Share price
therefore rises only on realised, measured MUSD — the vault never
trusts an index or an oracle for accounting. A user who exits before a
compound receives principal only; the yield stays for remaining holders
(covered by a test).

## 4. Judging-criteria mapping

| Criterion (weight) | How this scores |
|---|---|
| **Mezo integration (30%)** | Deep, not cosmetic: 90% of TVL sits in Mezo's own sMUSD vault; every flow (deposit, yield, exit) runs through MUSD/sMUSD. No integration could be removed without the product ceasing to exist. Extends an existing Mezo product instead of building a competing yield source. |
| **Product & business viability (30%)** | Solves a real gap: sMUSD yield must be claimed by hand and sMUSD is not ERC-4626 composable. Target users are MUSD holders on Mezo plus any aggregator/wallet that wants a standard yield-bearing MUSD. Monetisation path is explicit (performance fee up to 10%, default 0 for Wave 2). Roadmap: fixed-term bonds on top of the same vault, gauge staking option, multi-chain MUSD routing (see §7). |
| **Technical implementation (20%)** | One focused contract (~230 lines) + verified interface + 12 passing tests incl. donation/inflation resistance, pause semantics, fee caps, and yield attribution. Compiles on Solidity 0.8.24 with OpenZeppelin 5.3. Deploy script targets the live verified addresses and refuses mainnet without explicit confirmation. |
| **UX (10%)** | One action to start earning (approve + deposit); one click to exit; one click to compound. Demo app is a single static page with live vault stats and no build step. |
| **Submission materials (10%)** | This repo + DESIGN.md; deck and 2-min video still to be produced (see checklist). |

## 5. Competitor check (same Wave 2)

- **Levada** — cross-chain sMUSD vault from Base (bridge via Wormhole
  NTT, keeper network, 12h yield release). Different: ours is native
  to Mezo — no bridge, no keeper network, no cross-chain risk — and
  auto-compounds on-chain instead of relaying signed yield reports.
- **Doji** — BTC-collateral lending with sMUSD parking for waiting
  offers. Different product (lending vs savings); shares only the
  sMUSD primitive.
- **MUSD Pocket** — goal-based savings pots with borrow-into-goal.
  Different mechanics (goals vs auto-compounding vault) and audience.

## 6. Risks, assumptions, open items

1. **sMUSD min deposit duration (unverified value):** if a fresh vault
   deposit must age before its sMUSD can be withdrawn, large redemptions
   shortly after a deposit could revert. Mitigated by the 10% buffer and
   by the vault's long-lived position; must be confirmed on a testnet
   fork (deploy, deposit, attempt immediate partial sMUSD withdrawal)
   before mainnet.
2. **sMUSD withdraw semantics:** verified as "principal 1:1, yield via
   claimYield" from two independent sources (Mezo docs, Doji) plus
   live static-call behaviour. The vault measures balance deltas rather
   than assuming amounts, so a deviation fails closed (revert) instead
   of mis-accounting.
3. **Yield rate is variable and weekly:** the vault cannot promise an
   APR. The demo app shows the live `yieldIndex`, not a projected APR.
4. **Proxy risk:** sMUSD is a proxy; Mezo can upgrade it. The vault
   holds no upgrade power over it. Same trust assumption as using
   sMUSD directly.
5. **Prototype, not audited.** No real funds until an audit + fork test.

## 7. Roadmap (post-Wave 2, if it continues)

- Fixed-term MUSD bonds on top of the vault (7/30/90-day locks, early-exit
  penalty redistributed to remaining holders).
- Optional gauge staking of the vault's sMUSD for MEZO emissions (needs
  gauge addresses verified on the target chain first).
- Keeper bot that calls `compound()` on a schedule (permissionless;
  anyone can already call it by hand).
- Multi-chain MUSD intake (Base/Ethereum) via the official Wormhole NTT
  managers — only after the native vault is proven.

## 8. Test report (local, 2026-11-14)

- `npx hardhat compile` — 22 Solidity files, success.
- `npx hardhat test` — **12 passing, 0 failing**: deployment/linkage,
  buffer investing, buffer-served redeem, large redeem (claim-then-pull),
  compound raises share price, compound no-op + permissionless, fee cap
  + exact fee, pause blocks deposits but not withdrawals, admin caps,
  donation/inflation resistance, yield attribution to remaining holders,
  mint/withdraw round trip.
- `npx hardhat run scripts/deploy.js` (local network) — mocks + vault
  deploy + 100 MUSD seed deposit, success.

## 9. Submission checklist

### Done

- [x] Product design (this document)
- [x] Working prototype: contracts compile, 12 tests pass, deploy script
  smoke-tested locally
- [x] Verified live addresses/endpoints (testnet + mainnet)
- [x] Demo UI (`public/`, no build step)
- [x] README with setup / test / deploy instructions

### Still needs the user (nothing here can be done by an agent)

- [ ] Deploy the vault to **Mezo testnet** from the user's own wallet
  (`npm run deploy:testnet` with `DEPLOYER_KEY`; test BTC/MUSD from
  https://faucet.test.mezo.org). Record the vault address + explorer link.
- [ ] Verify the deployed contract on https://explorer.test.mezo.org
  and run `npm run verify-live` against it.
- [ ] Quick fork/live sanity: deposit a small amount of test MUSD,
  wait for / simulate yield, call `compound()`, withdraw — and confirm
  the sMUSD min-duration behaviour (§6.1) with a real testnet position.
- [ ] Push this repo to a **public GitHub repo** (submission requires it).
- [ ] Deploy the demo UI (`public/`) to a public link (e.g. Vercel).
- [ ] Write the **project deck** (problem, product, architecture,
  judging mapping §4, roadmap §7).
- [ ] Record the **2-minute pitch video** (demo the app on testnet).
- [ ] **Register on AKINDO** for the Mezo Buildathon
  (https://app.akindo.io/wave-hacks/OVOO0gdrVU8379D10) and join the
  Mezo Discord (https://discord.mezo.org) — mention you are a Mezo
  Hackathon participant to get the Developer role.
- [ ] Submit on AKINDO before **Wave 2 ends 15 Nov 2026** (judging
  16–22 Nov, winners announced 23 Nov). Submission needs: live
  testnet link, public GitHub repo, deck, 2-min video.
- [ ] KYB: Mezo requires know-your-business verification before any
  payout — start it early if selected.

### Honest Wave 2 feasibility note

Wave 2 ends **tomorrow (15 Nov 2026)**. What exists now is a complete,
tested prototype — but a *submittable* entry still needs the user's
testnet deployment, public repo, deck, and video, all of which require
the user's wallet and time. If those cannot all be done by the deadline,
the honest fallback is: submit what exists (repo + design + local demo)
and treat it as the base for the next Wave/program rather than a rushed,
half-verified deployment. Do not deploy to mainnet under deadline
pressure — testnet only for Wave 2.
