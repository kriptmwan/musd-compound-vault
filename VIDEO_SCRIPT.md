# MUSD Compound Vault — 2-Minute Pitch Video Script

For the Mezo Buildathon Wave 2 submission (deadline 15 Nov 2026).
Record after the testnet deploy so the demo is real, not mocked.
Total target: ~120 seconds. Read at a normal pace; the timings below are
checked against the word count (~150 words/minute).

## Setup (before recording)

- Deploy the vault to Mezo testnet first (`npm run deploy:testnet`), note the
  vault address.
- Serve `public/` somewhere public, open it with `?vault=<address>`, connect
  MetaMask on Mezo testnet (chain 31611) with test MUSD from
  https://faucet.test.mezo.org.
- Screen-record the demo app + your face/voiceover (phone is fine). Show the
  real explorer page for the vault at least once.
- Do NOT show any private key, seed phrase, or mainnet wallet on screen.

## Script

**[0:00–0:15] Hook — the problem**
> "MUSD holders on Mezo earn yield through sMUSD — but you have to claim it
> by hand, every week, and sMUSD isn't a standard vault token, so no wallet
> or aggregator can plug it in. Yield sits unclaimed. We built the fix:
> the MUSD Compound Vault."

**[0:15–0:45] Product — show the demo app**
> "Deposit MUSD, get cMUSD shares. That's it. The vault keeps ten percent
> as a buffer for instant withdrawals and puts the rest into Mezo's own
> sMUSD vault. [Click deposit on screen.] Anyone can call compound — it
> claims the yield and re-deposits it, so yield earns yield. [Click
> compound, show the share price.] Withdraw any time. No oracle, no swap,
> no leverage."

**[0:45–1:10] Why it's real — proof**
> "This is not a mockup. It's one focused contract, about 230 lines, on
> OpenZeppelin ERC-4626. Twelve tests pass — including inflation resistance
> and the compound math. The MUSD and sMUSD addresses are verified live on
> Mezo testnet and mainnet, and this vault you see here is deployed on
> testnet right now. [Show the explorer page with the vault address.]"

**[1:10–1:40] Why Mezo-native**
> "Ninety percent of the vault's value sits inside Mezo's own sMUSD vault.
> Take the Mezo integration away and the product stops existing — it extends
> sMUSD instead of competing with it. And because it's standard ERC-4626,
> any wallet or aggregator can list cMUSD with no extra work."

**[1:40–2:00] Close — honest scope + ask**
> "Honest note: this is a prototype, not audited — testnet only for Wave 2,
> and there's one sMUSD timing detail we still need to confirm on a fork
> before mainnet. Links are below: live demo, repo, and design doc. Thanks
> — and if you hold MUSD, this is the vault that compounds while you sleep."

## Shot list (check off while editing)

- [ ] 0:00 title card: "MUSD Compound Vault — Mezo Buildathon, Track 1"
- [ ] 0:15 demo app open, vault address visible in the URL/stats
- [ ] 0:30 deposit click → cMUSD balance appears
- [ ] 0:45 compound click → share price / total assets move
- [ ] 1:00 explorer.test.mezo.org page showing the deployed vault contract
- [ ] 1:40 end card with the three links (demo, repo, AKINDO)

## After recording

- Upload (YouTube unlisted or Loom), copy the link into the AKINDO
  submission and into `DECK.md` slide 10.
- Keep it under 2:00 — AKINDO asks for a 2-minute pitch; trim pauses rather
  than speeding up the voiceover.
