// Read-only live state check for a deployed MusdCompoundVault.
// No transactions, no signing.
//
//   VAULT=0x... npx hardhat run scripts/verify-live.js --network mezoTestnet
const hre = require("hardhat");

const VAULT_ABI = [
  "function asset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function idle() view returns (uint256)",
  "function invested() view returns (uint256)",
  "function bufferTarget() view returns (uint256)",
  "function bufferBps() view returns (uint256)",
  "function performanceFeeBps() view returns (uint256)",
  "function yieldIndex() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function convertToAssets(uint256) view returns (uint256)",
];
const SMUSD_ABI = [
  "function totalSupply() view returns (uint256)",
  "function yieldIndex() view returns (uint256)",
  "function musdToken() view returns (address)",
];

async function main() {
  const vaultAddress = process.env.VAULT;
  if (!vaultAddress) throw new Error("Set VAULT=0x... (the deployed vault address)");
  const provider = hre.ethers.provider;
  const net = await provider.getNetwork();
  console.log("Network chainId:", net.chainId.toString());

  const vault = new hre.ethers.Contract(vaultAddress, VAULT_ABI, provider);
  const [symbol, decimals, asset, totalAssets, totalSupply, idle, invested, bufferTarget, bufferBps, feeBps, yieldIndex] =
    await Promise.all([
      vault.symbol(),
      vault.decimals(),
      vault.asset(),
      vault.totalAssets(),
      vault.totalSupply(),
      vault.idle(),
      vault.invested(),
      vault.bufferTarget(),
      vault.bufferBps(),
      vault.performanceFeeBps(),
      vault.yieldIndex(),
    ]);
  const fmt = (v) => hre.ethers.formatUnits(v, decimals);
  console.log(`Vault ${vaultAddress} (${symbol})`);
  console.log(`  asset (MUSD)      : ${asset}`);
  console.log(`  totalAssets       : ${fmt(totalAssets)} MUSD`);
  console.log(`  totalSupply       : ${fmt(totalSupply)} ${symbol}`);
  console.log(`  share price       : ${totalSupply > 0 ? fmt(await vault.convertToAssets(hre.ethers.parseUnits("1", decimals))) : "n/a"} MUSD per 1 ${symbol}`);
  console.log(`  idle MUSD (buffer): ${fmt(idle)} (target ${fmt(bufferTarget)}, ${bufferBps} bps)`);
  console.log(`  invested in sMUSD: ${fmt(invested)}`);
  console.log(`  performance fee   : ${feeBps} bps`);
  console.log(`  sMUSD yieldIndex  : ${yieldIndex}`);

  const smusd = new hre.ethers.Contract(
    // sMUSD address is read from the vault's asset flow: resolve via musdToken
    // is not possible from the vault, so read it from the deployed config:
    process.env.SMUSD || "0x0000000000000000000000000000000000000000",
    SMUSD_ABI,
    provider
  );
  if (process.env.SMUSD) {
    const [sSupply, sIndex, sMusd] = await Promise.all([
      smusd.totalSupply(),
      smusd.yieldIndex(),
      smusd.musdToken(),
    ]);
    console.log(`sMUSD ${process.env.SMUSD}`);
    console.log(`  totalSupply       : ${fmt(sSupply)} sMUSD`);
    console.log(`  yieldIndex        : ${sIndex}`);
    console.log(`  musdToken         : ${sMusd} (expect ${asset})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
