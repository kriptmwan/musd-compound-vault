# MUSD Compound Vault — AKINDO Wave 2 Submission Draft

Prepared 2026-11-15 from the live AKINDO page (deadline 15 Nov 2026 ~22:00 WIB,
from the page countdown). Copy-paste into the AKINDO submission form; adjust
team info before submitting. Video link still missing — record first.

## What you submit (package)

- Live project (testnet): https://kriptmwan.github.io/musd-compound-vault/
- Public GitHub repo: https://github.com/kriptmwan/musd-compound-vault
- Deck: `DECK.md` in the repo
- 2-minute pitch video: [ADD LINK AFTER UPLOAD — YouTube unlisted or Loom]

## Submission form

- **Project name:** MUSD Compound Vault
- **Project category:** auto-compounding yield vault
- **TL;DR:** An ERC-4626 vault that auto-compounds MUSD yield — deposit MUSD, get
  cMUSD shares, and the vault claims and re-deposits sMUSD yield for you.
- **How it works:** MUSD holders on Mezo earn yield through sMUSD, but they
  have to claim it by hand every week, and sMUSD is not a standard vault
  token, so no wallet or aggregator can plug it in. The vault keeps 10% of
  deposits as an idle MUSD buffer for instant withdrawals and invests the
  other 90% into Mezo's own sMUSD vault. Anyone can call the permissionless
  `compound()` function, which claims accrued sMUSD yield and re-deposits it,
  so yield earns yield. No oracle, no swap, no leverage. Share price rises
  as yield compounds. Deployed on Mezo testnet (chain 31611), vault
  `0x148D18B0D05D7ae097eBB5A3c48D4c5a7269b6e7`, seeded with 25 MUSD
  (totalAssets 25.0 MUSD, 2.5 idle / 22.5 invested, share price 1.0 at deploy).
- **Target group:** MUSD holders who want passive yield without weekly manual
  claims, and wallets/aggregators that need a standard ERC-4626 token (cMUSD)
  to list MUSD yield. Fits Track 1 DeFi: yield-generating vaults and
  auto-compounding strategies for MUSD/MEZO.
- **Tech stack:** Solidity 0.8.24, OpenZeppelin ERC-4626 / ERC-20 / Ownable /
  Pausable / ReentrancyGuard, Hardhat 2.28, ethers.js 6 demo UI, GitHub Pages.
  12 Hardhat tests passing (incl. inflation resistance and compound math).
- **Track:** Track 1 (DeFi)
- **Chain deployed on:** Mezo (testnet, chain 31611)
- **Project status:** Entirely new (built during Wave 2)
- **Project readiness:** Testnet deployment
- **Future milestones:**
  1. Confirm the sMUSD minimum-deposit-duration detail on a mainnet fork
     (by end Nov 2026) — the one open risk, mitigated by the 10% buffer.
  2. External audit of the single vault contract, then mainnet deploy with a
     capped TVL and timelocked owner (Dec 2026).
  3. Fixed-term MUSD bond vaults (7/30/90-day locks) on top of the same
     contract, plus a cMUSD aggregator listing (Q1 2027).
- **Team info:** [FILL IN — solo builder: name, role, X/LinkedIn]

## Registration (before submitting)

1. AKINDO account (email sign-in at https://app.akindo.io/login).
2. Join Mezo Discord https://discord.mezo.org — mention you are a Mezo
   Hackathon participant to get the Developer role.
3. Registration questions per team member: full name, email, Telegram handle,
   Discord handle, GitHub; experience level; focus area; product status;
   location; plan to continue after the hackathon.
4. Agree to the Terms of Participation.

## Notes from the live page (2026-11-15 09:19 WIB)

- Wave 2: 2–15 Nov 2026; judging 16–22 Nov; winners 23 Nov 2026 (online).
- Prize: $5,000 MEZO for Wave 2 (of $7,000 total incl. Wave 1 $2,000).
  Proportional to points — no fixed number of winners.
- Judging: Mezo Integration 30%, Product & Business Viability 30%,
  Technical Implementation 20%, UX 10%, Submission Materials 10%.
- KYB required only if selected for a reward (before payout).
