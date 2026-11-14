# MUSD Compound Vault — Mezo Buildathon, Track 1 (DeFi)

Auto-compounding ERC-4626 vault for MUSD on Mezo. Deposit MUSD, receive
cMUSD shares, earn Mezo's native MUSD Savings Rate (sMUSD) yield —
compounded. No oracle, no swap, no leverage, no external protocol besides
Mezo's own sMUSD vault.

Built for the **Mezo Buildathon on AKINDO** (Wave 2: 2–15 Nov 2026).
See [DESIGN.md](./DESIGN.md) for the full design, verified addresses,
judging-criteria mapping, and the submission checklist.

## Quickstart

```bash
npm install
npm test        # 12 tests, local Hardhat network, mocked MUSD + sMUSD
npm run compile
```

## Deploy (Mezo testnet, chain 31611)

1. Get test BTC + test MUSD from the faucet: https://faucet.test.mezo.org
2. Put your deployer key in the environment (never commit it):
   ```bash
   export DEPLOYER_KEY=0x...   # testnet-only key
   ```
3. Deploy:
   ```bash
   npm run deploy:testnet
   # Optional: seed the vault in the same run
   SEED_MUSD=100 npm run deploy:testnet
   ```
   The deploy script uses the live, verified addresses (MUSD
   `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`, sMUSD
   `0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16`) and refuses mainnet
   unless `CONFIRM_MAINNET=1` is set.
4. Check live state:
   ```bash
   VAULT=0x... SMUSD=0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16 npm run verify-live
   ```

## Demo app

`public/index.html` + `public/app.js` — a no-build-step demo UI. Serve it
statically (e.g. Vercel, GitHub Pages, or `npx serve public`), open it with
`?vault=0x...` (the deployed vault address), connect MetaMask on Mezo
testnet, and deposit / withdraw / compound.

## How it works

- **Deposit** MUSD → get cMUSD shares. The vault keeps a 10% MUSD buffer
  for instant redemptions and invests the rest into sMUSD.
- **Yield** comes from Mezo protocol fees on Bitcoin-backed MUSD loans,
  distributed to sMUSD weekly. Yield is *not* priced into shares until it
  is realised.
- **Compound** (permissionless, anyone can call): claims the vault's
  accrued sMUSD yield as MUSD and re-deposits it, so yield earns yield.
  Share price rises only on realised, measured MUSD.
- **Withdraw** MUSD → served from the buffer first; if short, the vault
  claims yield first, then withdraws principal from sMUSD.
- **Fees:** 0 by default. The owner may set a performance fee up to 10% of
  harvested yield (taken only at compound time).
- **Pause:** the owner can pause deposits. Withdrawals can never be paused.

## Layout

```
contracts/
  MusdCompoundVault.sol   # core ERC-4626 vault
  interfaces/ISMUSD.sol   # minimal sMUSD interface (verified live)
  mocks/MockMUSD.sol      # test-only MUSD stand-in
  mocks/MockSMUSD.sol     # test-only sMUSD stand-in (documented semantics)
test/MusdCompoundVault.test.js   # 12 tests
scripts/deploy.js         # testnet/mainnet deploy (mainnet gated)
scripts/verify-live.js    # read-only live state check
public/                   # demo UI (no build step)
DESIGN.md                 # full design + submission checklist
```

## Security notes (read before mainnet)

- Prototype, not audited. Do not use with real funds without an audit.
- The vault trusts Mezo's sMUSD vault (audited by Halborn, Jan 2026) and
  OpenZeppelin ERC4626 (virtual-share offset against inflation attacks).
- Known integration assumption to confirm on a Mezo testnet fork before
  mainnet: sMUSD enforces a minimum deposit duration (Halborn 7.1 fix).
  The vault's sMUSD position is long-lived and redemptions are served
  from the buffer, so normal use never churns it — but the exact
  min-duration value and per-lot behaviour are unverified. See DESIGN.md.
- `totalAssets()` counts only idle MUSD + sMUSD principal. Unclaimed sMUSD
  yield is deliberately excluded until `compound()` realises it.
