# MUSD Compound Vault — Pitch Deck (Mezo Buildathon, Track 1 DeFi)

Wave 2 submission deck. 10 slides, ready to paste into Google Slides / Canva.
All facts verified 2026-11-14 from `DESIGN.md` and the live contracts in this repo.
Testnet only for Wave 2 — do not present this as mainnet-ready or audited.

**How to use:** one slide = one section below. Bold line = slide headline.
Bullet = slide body. *Speaker note* = what to say (also the basis for the
2-minute video script in `VIDEO_SCRIPT.md`).

---

## Slide 1 — Title

**MUSD Compound Vault — auto-compounding yield for MUSD, native to Mezo**

- Mezo Buildathon, Track 1 (DeFi) — Wave 2
- One line: deposit MUSD, get cMUSD, yield compounds itself.
- Live testnet demo + public repo (links on final slide — fill in after deploy)

*Speaker note: "MUSD holders on Mezo earn yield through sMUSD — but today they
have to claim it by hand, and sMUSD isn't a standard ERC-4626 vault. We fixed
both."*

## Slide 2 — Problem

**sMUSD pays yield. Using it is manual and uncomposable.**

- Yield from Mezo protocol fees is distributed to sMUSD weekly — but it must
  be claimed by hand, per position, per week.
- sMUSD is not ERC-4626, so wallets, aggregators and other protocols can't
  plug it in as a standard yield-bearing token.
- Result: yield sits unclaimed, and MUSD holders either babysit a claim
  transaction or leave money on the table.

*Speaker note: the pain is real but small per claim — which is exactly why
nobody does it every week, and why the yield leaks.*

## Slide 3 — Product

**Deposit MUSD → get cMUSD. Yield compounds on-chain, automatically.**

- Deposit MUSD, receive cMUSD shares (ERC-4626).
- The vault keeps a 10% MUSD buffer for instant redemptions and invests the
  rest into Mezo's own sMUSD vault.
- Anyone can call `compound()` — it claims accrued sMUSD yield as MUSD and
  re-deposits it. Yield earns yield, with no keeper and no bot required.
- Withdraw any time: buffer first, then claim yield, then pull principal
  from sMUSD. Withdrawals can never be paused.

*Speaker note: one action to start earning, one click to exit, one click to
compound — that's the whole UX.*

## Slide 4 — How it works (architecture)

**No oracle. No swap. No leverage. No new yield source.**

```
User MUSD ──► MUSD Compound Vault (ERC-4626, cMUSD)
                 ├─ 10% buffer: idle MUSD (instant redeem)
                 └─ 90% invested: sMUSD (Mezo's own Savings Rate vault)
compound() ──► claimYield() on sMUSD ──► re-deposit ──► share price rises
```

- Share price rises only on realised, measured MUSD — unclaimed yield is
  deliberately *not* counted in `totalAssets()` until `compound()` realises it.
- Fees: 0 by default. Owner may set a performance fee up to 10% of harvested
  yield, taken only at compound time.
- Built on OpenZeppelin ERC-4626 (virtual-share offset against inflation
  attacks) + Mezo's sMUSD vault (audited by Halborn, Jan 2026).

## Slide 5 — Why it's native Mezo (integration depth)

**90% of TVL sits in Mezo's own vault. Remove the integration, the product stops existing.**

- Every flow — deposit, yield, exit — runs through MUSD / sMUSD. This is not
  a generic vault with a Mezo logo on top.
- It extends an existing Mezo product instead of competing with it: sMUSD
  stays the yield source; the vault makes it composable and self-compounding.
- Same-wave alternatives do something different: Levada bridges sMUSD
  cross-chain from Base (bridge + keeper risk); Doji is BTC-collateral
  lending; MUSD Pocket is goal-based savings. Ours is the native,
  on-Mezo, auto-compounding route.

## Slide 6 — Proof it works

**12 tests passing, 0 failing. Verified against live Mezo contracts.**

- `npx hardhat test` — 12 passing: buffer investing, buffer-served redeem,
  large redeem (claim-then-pull), compound raises share price, permissionless
  compound, fee cap + exact fee, pause blocks deposits but not withdrawals,
  donation / inflation resistance, yield attribution to remaining holders,
  mint/withdraw round trip.
- Live addresses verified via public RPC (testnet chain 31611, mainnet 31612):
  MUSD testnet `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`,
  sMUSD testnet `0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16`.
- Deploy script targets those live addresses and refuses mainnet without
  explicit confirmation. Demo UI is a single static page, no build step.

*Speaker note: if the testnet deploy is done, swap this slide's bottom line
for the live vault address + explorer link + a screenshot of the demo app.*

## Slide 7 — Who it's for & business model

**MUSD holders first; aggregators and wallets second.**

- Users: anyone holding MUSD on Mezo who wants yield without weekly chores.
- Distribution: any wallet or aggregator that speaks ERC-4626 can list cMUSD
  with zero extra integration work.
- Monetisation: performance fee up to 10% of harvested yield (default 0 for
  Wave 2) — charged only when yield is actually realised.
- Roadmap: fixed-term MUSD bonds on top of the same vault (7/30/90-day locks),
  optional gauge staking for MEZO emissions, a scheduled keeper for
  `compound()`, multi-chain MUSD intake later via official Wormhole NTT.

## Slide 8 — Honest risks

**Prototype, not audited. Testnet only for Wave 2.**

- The vault trusts Mezo's sMUSD vault (Halborn-audited) — sMUSD is a proxy
  Mezo can upgrade; same trust assumption as holding sMUSD directly.
- One open item to confirm on a testnet fork before any mainnet use: sMUSD
  enforces a minimum deposit duration (Halborn 7.1 fix); the exact value is
  unverified. Mitigated by the 10% buffer and the vault's long-lived position.
- Yield rate is variable and weekly — the vault promises no APR.
- No real funds until an audit + fork test. Nothing in this submission asks
  judges to trust unaudited mainnet code.

*Speaker note: say this slide out loud. Judges trust a team that names its
own open item more than one that hides it.*

## Slide 9 — What we need from Wave 2 / ask

**A working vault on Mezo testnet, ready to grow into the next wave.**

- Wave 2 deliverables: live testnet vault + demo link, public GitHub repo,
  this deck, 2-minute video.
- If selected: KYB first (required before any payout), then fork-test the
  sMUSD minimum-duration behaviour, then audit before mainnet.
- If not selected: the repo and design carry straight into the next
  Wave/program — the vault is chain-native, not deadline-specific.

## Slide 10 — Links

**Try it / read it**

- Live demo (testnet): *[fill in after deploying `public/` — e.g. Vercel link]*
- Vault on Mezo testnet explorer: *[fill in vault address after `npm run deploy:testnet`]*
- Public GitHub repo: *[fill in after push]*
- Design + test report: `DESIGN.md` in the repo
- AKINDO: https://app.akindo.io/wave-hacks/OVOO0gdrVU8379D10

*Fill the three bracketed links in before submitting — a deck with
placeholder links reads as unfinished. Submission deadline: Wave 2 ends
15 Nov 2026.*

---

## Judging-criteria coverage (for the presenter, not a slide)

| Criterion (weight) | Covered on |
|---|---|
| Mezo integration (30%) | Slides 4–5 |
| Product & business viability (30%) | Slides 2–3, 7 |
| Technical implementation (20%) | Slides 4, 6 |
| UX (10%) | Slide 3 |
| Submission materials (10%) | This deck + `VIDEO_SCRIPT.md` + repo |
