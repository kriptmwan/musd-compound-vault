// Minimal demo UI for MusdCompoundVault on Mezo testnet (chain 31611).
// No build step: open index.html with ?vault=0x... and connect MetaMask.
// Testnet only — never point this at mainnet with real funds.
const params = new URLSearchParams(location.search);
// Live vault on Mezo testnet (deployed 2026-11-15, seeded 25 MUSD). ?vault= overrides.
const VAULT_ADDRESS = params.get("vault") || "0x148D18B0D05D7ae097eBB5A3c48D4c5a7269b6e7";
const MUSD_TESTNET = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";
const MEZO_TESTNET_CHAIN_ID = 31611;

const VAULT_ABI = [
  "function asset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function idle() view returns (uint256)",
  "function invested() view returns (uint256)",
  "function yieldIndex() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function deposit(uint256,address) returns (uint256)",
  "function withdraw(uint256,address,address) returns (uint256)",
  "function compound()",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const $ = (id) => document.getElementById(id);
const status = (msg) => { $("status").textContent = msg; };
let provider, signer, vault, musd, account;

async function refresh() {
  if (!VAULT_ADDRESS) { status("Missing ?vault=0x… in the URL."); return; }
  const readProvider = provider ?? new ethers.JsonRpcProvider("https://rpc.test.mezo.org");
  const v = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, readProvider);
  const net = await readProvider.getNetwork();
  $("net").textContent = `chain ${net.chainId} (want ${MEZO_TESTNET_CHAIN_ID})`;
  const [assets, supply, idle, invested, yidx] = await Promise.all([
    v.totalAssets(), v.totalSupply(), v.idle(), v.invested(), v.yieldIndex(),
  ]);
  const price = supply > 0n ? await v.convertToAssets(ethers.parseUnits("1", 18)) : 0n;
  $("assets").textContent = `${ethers.formatUnits(assets, 18)} MUSD`;
  $("price").textContent = supply > 0n ? `${ethers.formatUnits(price, 18)} MUSD / cMUSD` : "— (empty vault)";
  $("split").textContent = `${ethers.formatUnits(idle, 18)} idle / ${ethers.formatUnits(invested, 18)} in sMUSD`;
  $("yidx").textContent = yidx.toString();
  if (account) {
    const m = new ethers.Contract(MUSD_TESTNET, ERC20_ABI, readProvider);
    const [bal, shares, value] = await Promise.all([
      m.balanceOf(account), v.balanceOf(account),
      v.convertToAssets(await v.balanceOf(account)),
    ]);
    $("musdBal").textContent = `${ethers.formatUnits(bal, 18)} MUSD`;
    $("shares").textContent = `${ethers.formatUnits(shares, 18)} cMUSD`;
    $("sharesValue").textContent = `${ethers.formatUnits(value, 18)} MUSD`;
  }
}

$("vaultLink").textContent = VAULT_ADDRESS || "— (add ?vault=0x… to the URL)";
$("vaultLink").href = VAULT_ADDRESS ? `https://explorer.test.mezo.org/address/${VAULT_ADDRESS}` : "#";

$("connect").onclick = async () => {
  try {
    if (!window.ethereum) { status("No wallet found. Install MetaMask and try again."); return; }
    provider = new ethers.BrowserProvider(window.ethereum);
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== MEZO_TESTNET_CHAIN_ID) {
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{
        chainId: "0x7b7b", chainName: "Mezo Testnet",
        nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
        rpcUrls: ["https://rpc.test.mezo.org"], blockExplorerUrls: ["https://explorer.test.mezo.org"],
      }]});
      provider = new ethers.BrowserProvider(window.ethereum);
    }
    signer = await provider.getSigner();
    account = await signer.getAddress();
    $("acct").textContent = account;
    vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);
    musd = new ethers.Contract(MUSD_TESTNET, ERC20_ABI, signer);
    status(`Connected as ${account}`);
    await refresh();
  } catch (e) { status(`Connect failed: ${e.message || e}`); }
};

$("refresh").onclick = refresh;

$("deposit").onclick = async () => {
  try {
    const amt = ethers.parseUnits($("depAmt").value || "0", 18);
    if (amt <= 0n) { status("Enter an amount first."); return; }
    status("Approving MUSD…");
    const allowance = await musd.allowance(account, VAULT_ADDRESS);
    if (allowance < amt) {
      await (await musd.approve(VAULT_ADDRESS, amt)).wait();
    }
    status("Depositing…");
    const tx = await vault.deposit(amt, account);
    status(`Deposit sent: ${tx.hash}\nWaiting for confirmation…`);
    await tx.wait();
    status(`Deposited ${ethers.formatUnits(amt, 18)} MUSD.`);
    await refresh();
  } catch (e) { status(`Deposit failed: ${e.message || e}`); }
};

$("withdraw").onclick = async () => {
  try {
    const amt = ethers.parseUnits($("wdAmt").value || "0", 18);
    if (amt <= 0n) { status("Enter an amount first."); return; }
    status("Withdrawing…");
    const tx = await vault.withdraw(amt, account, account);
    status(`Withdraw sent: ${tx.hash}\nWaiting for confirmation…`);
    await tx.wait();
    status(`Withdrew ${ethers.formatUnits(amt, 18)} MUSD.`);
    await refresh();
  } catch (e) { status(`Withdraw failed: ${e.message || e}`); }
};

$("compound").onclick = async () => {
  try {
    status("Compounding…");
    const tx = await vault.compound();
    status(`Compound sent: ${tx.hash}\nWaiting for confirmation…`);
    await tx.wait();
    status("Compounded. Share price should have risen if yield had accrued.");
    await refresh();
  } catch (e) { status(`Compound failed: ${e.message || e}`); }
};

refresh().catch((e) => status(`Load failed: ${e.message || e}`));
