// Deploy MusdCompoundVault.
//  - localhost / hardhat: deploys MockMUSD + MockSMUSD first, then the vault.
//  - mezoTestnet: uses the live, verified MUSD + sMUSD addresses.
//  - mezoMainnet: REFUSES to deploy unless CONFIRM_MAINNET=1 is set.
//
// Required env: DEPLOYER_KEY (hex private key, never commit it).
// Optional env: BUFFER_BPS (default 1000 = 10%), SEED_MUSD (e.g. "100"
//   = deployer seeds the vault with 100 MUSD right after deploy; the
//   deployer must already hold that MUSD — on testnet, from the faucet
//   at https://faucet.test.mezo.org).
//
//   npx hardhat run scripts/deploy.js --network mezoTestnet
const hre = require("hardhat");

const ADDRESSES = {
  mezoTestnet: {
    musd: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
    smusd: "0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16",
  },
  mezoMainnet: {
    musd: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
    smusd: "0xb4D498029af77680cD1eF828b967f010d06C51CC",
  },
};

async function main() {
  const network = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  console.log("Network :", network);
  console.log("Deployer:", deployer.address);

  if (network === "mezoMainnet" && process.env.CONFIRM_MAINNET !== "1") {
    throw new Error(
      "Mainnet deploy refused. Re-run with CONFIRM_MAINNET=1 after a " +
        "successful testnet deployment and a fork test against mainnet."
    );
  }

  let musdAddress;
  let smusdAddress;

  if (network === "localhost" || network === "hardhat") {
    const MockMUSD = await hre.ethers.getContractFactory("MockMUSD");
    const musd = await MockMUSD.deploy();
    await musd.waitForDeployment();
    musdAddress = await musd.getAddress();
    console.log("MockMUSD deployed:", musdAddress);

    const MockSMUSD = await hre.ethers.getContractFactory("MockSMUSD");
    const smusd = await MockSMUSD.deploy(musdAddress);
    await smusd.waitForDeployment();
    smusdAddress = await smusd.getAddress();
    console.log("MockSMUSD deployed:", smusdAddress);

    // Fund the deployer with test MUSD for the seed deposit.
    await (await musd.mint(deployer.address, hre.ethers.parseUnits("100000", 18))).wait();
    console.log("Minted 100,000 mock MUSD to deployer");
  } else {
    const addrs = ADDRESSES[network];
    if (!addrs) throw new Error(`No verified addresses for network ${network}`);
    musdAddress = addrs.musd;
    smusdAddress = addrs.smusd;
    console.log("Using live MUSD :", musdAddress);
    console.log("Using live sMUSD:", smusdAddress);
  }

  const bufferBps = parseInt(process.env.BUFFER_BPS || "1000", 10);
  const Vault = await hre.ethers.getContractFactory("MusdCompoundVault");
  const vault = await Vault.deploy(musdAddress, smusdAddress, bufferBps);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("MusdCompoundVault deployed:", vaultAddress);
  console.log("Buffer:", bufferBps, "bps | fee: 0 bps | owner:", deployer.address);

  const seed = process.env.SEED_MUSD;
  if (seed) {
    const musd = await hre.ethers.getContractAt(
      ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"],
      musdAddress
    );
    const amount = hre.ethers.parseUnits(seed, 18);
    const bal = await musd.balanceOf(deployer.address);
    if (bal < amount) {
      console.log(
        `WARNING: deployer holds ${hre.ethers.formatUnits(bal, 18)} MUSD, ` +
          `less than SEED_MUSD=${seed}. Skipping seed deposit — fund the ` +
          `deployer (testnet faucet: https://faucet.test.mezo.org) and ` +
          `deposit manually.`
      );
    } else {
      await (await musd.approve(vaultAddress, amount)).wait();
      await (await vault.deposit(amount, deployer.address)).wait();
      console.log(`Seeded vault with ${seed} MUSD from deployer`);
    }
  }

  console.log("\nNext steps:");
  console.log(`  1. Verify on the explorer: https://explorer.test.mezo.org/address/${vaultAddress}`);
  console.log(`  2. Read live state: VAULT=${vaultAddress} npx hardhat run scripts/verify-live.js --network ${network}`);
  console.log(`  3. Point the demo app at it: open public/index.html with ?vault=${vaultAddress}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
