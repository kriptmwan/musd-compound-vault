const { expect } = require("chai");
const { ethers } = require("hardhat");

const parse = (v) => ethers.parseUnits(v, 18);
const fmt = (v) => ethers.formatUnits(v, 18);

describe("MusdCompoundVault", function () {
  let musd, smusd, vault;
  let owner, alice, bob, attacker;
  const BUFFER_BPS = 1000; // 10%

  async function fund(user, amount) {
    await musd.mint(user.address, amount);
    await musd.connect(user).approve(await vault.getAddress(), amount);
  }

  beforeEach(async function () {
    [owner, alice, bob, attacker] = await ethers.getSigners();

    const MockMUSD = await ethers.getContractFactory("MockMUSD");
    musd = await MockMUSD.deploy();

    const MockSMUSD = await ethers.getContractFactory("MockSMUSD");
    smusd = await MockSMUSD.deploy(await musd.getAddress());

    const Vault = await ethers.getContractFactory("MusdCompoundVault");
    vault = await Vault.deploy(await musd.getAddress(), await smusd.getAddress(), BUFFER_BPS);
  });

  it("deploys with the right asset, token and sMUSD link", async function () {
    expect(await vault.asset()).to.equal(await musd.getAddress());
    expect(await vault.symbol()).to.equal("cMUSD");
    expect(await vault.sMUSD()).to.equal(await smusd.getAddress());
    expect(await smusd.musdToken()).to.equal(await musd.getAddress());
    expect(await vault.bufferBps()).to.equal(BUFFER_BPS);
    expect(await vault.performanceFeeBps()).to.equal(0);
    expect(await vault.totalAssets()).to.equal(0);
  });

  it("deposit invests everything above the buffer into sMUSD", async function () {
    await fund(alice, parse("1000"));
    await vault.connect(alice).deposit(parse("1000"), alice.address);

    expect(await vault.totalAssets()).to.equal(parse("1000"));
    expect(await vault.balanceOf(alice.address)).to.equal(parse("1000"));
    // 10% buffer stays idle, 90% goes to sMUSD.
    expect(await vault.idle()).to.equal(parse("100"));
    expect(await vault.invested()).to.equal(parse("900"));
    expect(await smusd.balanceOf(await vault.getAddress())).to.equal(parse("900"));
  });

  it("small redeem is served from the buffer without touching sMUSD", async function () {
    await fund(alice, parse("1000"));
    await vault.connect(alice).deposit(parse("1000"), alice.address);
    const smusdBefore = await smusd.balanceOf(await vault.getAddress());

    await vault.connect(alice).redeem(parse("50"), alice.address, alice.address);

    expect(await smusd.balanceOf(await vault.getAddress())).to.equal(smusdBefore);
    expect(await musd.balanceOf(alice.address)).to.equal(parse("50"));
  });

  it("large redeem claims yield first, then pulls principal from sMUSD", async function () {
    await fund(alice, parse("1000"));
    await vault.connect(alice).deposit(parse("1000"), alice.address);

    // Simulate one weekly yield distribution: 10% on the 900 invested.
    await musd.mint(await smusd.getAddress(), parse("90"));
    await smusd.accrueYield(parse("90"));
    await vault.compound(); // realise + reinvest the yield

    // Now redeem everything. Yield was compounded, so alice gets > 1000.
    const before = await musd.balanceOf(alice.address);
    await vault.connect(alice).redeem(await vault.balanceOf(alice.address), alice.address, alice.address);
    const received = (await musd.balanceOf(alice.address)) - before;
    expect(received).to.be.closeTo(parse("1090"), parse("0.01"));
    // 1 wei of rounding dust may remain; the vault is effectively empty.
    expect(await vault.totalAssets()).to.be.lte(1);
  });

  it("compound() realises yield and raises the share price", async function () {
    await fund(alice, parse("1000"));
    await vault.connect(alice).deposit(parse("1000"), alice.address);
    expect(await vault.convertToAssets(parse("1"))).to.equal(parse("1"));

    await musd.mint(await smusd.getAddress(), parse("90"));
    await smusd.accrueYield(parse("90"));

    // Share price does NOT move before compounding: unclaimed yield is not counted.
    expect(await vault.convertToAssets(parse("1"))).to.equal(parse("1"));

    await expect(vault.compound()).to.emit(vault, "Compounded");
    // 90 yield harvested, 0 fee, reinvested above the buffer.
    expect(await vault.convertToAssets(parse("1"))).to.be.closeTo(parse("1.09"), parse("0.001"));

    // A late depositor gets fewer shares per MUSD after yield.
    await fund(bob, parse("1090"));
    await vault.connect(bob).deposit(parse("1090"), bob.address);
    expect(await vault.balanceOf(bob.address)).to.be.closeTo(parse("1000"), parse("1"));
  });

  it("compound() is a harmless no-op with no accrued yield and callable by anyone", async function () {
    await fund(alice, parse("500"));
    await vault.connect(alice).deposit(parse("500"), alice.address);
    await vault.connect(bob).compound();
    await vault.connect(bob).compound();
    expect(await vault.totalAssets()).to.equal(parse("500"));
  });

  it("performance fee takes at most the configured share of harvested yield", async function () {
    await vault.setPerformanceFeeBps(1000); // 10%
    await fund(alice, parse("1000"));
    await vault.connect(alice).deposit(parse("1000"), alice.address);

    await musd.mint(await smusd.getAddress(), parse("100"));
    await smusd.accrueYield(parse("100"));

    const feeBefore = await musd.balanceOf(owner.address);
    await vault.compound();
    const feeGot = (await musd.balanceOf(owner.address)) - feeBefore;
    // 10% of ~100 harvested; a few wei of rounding come from the mock's
    // 1e18-scaled yield-index math.
    expect(feeGot).to.be.closeTo(parse("10"), parse("0.01"));
    // Remaining 90 reinvested: share price ~1.09, not 1.10.
    expect(await vault.convertToAssets(parse("1"))).to.be.closeTo(parse("1.09"), parse("0.001"));
  });

  it("pausing blocks deposits but never withdrawals", async function () {
    await fund(alice, parse("1000"));
    await vault.connect(alice).deposit(parse("1000"), alice.address);
    await vault.pause();

    await fund(bob, parse("100"));
    await expect(vault.connect(bob).deposit(parse("100"), bob.address)).to.be.revertedWithCustomError(
      vault,
      "EnforcedPause"
    );
    await expect(vault.connect(bob).mint(parse("100"), bob.address)).to.be.revertedWithCustomError(
      vault,
      "EnforcedPause"
    );

    // Exit still works while paused.
    await vault.connect(alice).redeem(parse("100"), alice.address, alice.address);
    expect(await musd.balanceOf(alice.address)).to.equal(parse("100"));

    await vault.unpause();
    await vault.connect(bob).deposit(parse("100"), bob.address);
    expect(await vault.balanceOf(bob.address)).to.be.gt(0);
  });

  it("owner-only admin with hard caps", async function () {
    await expect(vault.connect(alice).setBufferBps(100)).to.be.revertedWithCustomError(
      vault,
      "OwnableUnauthorizedAccount"
    );
    await expect(vault.setBufferBps(5001)).to.be.revertedWithCustomError(vault, "BufferTooHigh");
    await expect(vault.setPerformanceFeeBps(1001)).to.be.revertedWithCustomError(vault, "FeeTooHigh");
    await expect(vault.setFeeRecipient(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      vault,
      "ZeroAddress"
    );

    await vault.setBufferBps(2000);
    expect(await vault.bufferBps()).to.equal(2000);
    await vault.setPerformanceFeeBps(500);
    expect(await vault.performanceFeeBps()).to.equal(500);
  });

  it("donation does not let the first depositor steal from later depositors", async function () {
    // Attacker is the first depositor with a small deposit, then donates a lot.
    await fund(attacker, parse("1"));
    await vault.connect(attacker).deposit(parse("1"), attacker.address);
    await musd.mint(attacker.address, parse("10000"));
    await musd.connect(attacker).transfer(await vault.getAddress(), parse("10000"));

    // Bob deposits 1,000 at the inflated price and redeems: gets ~his 1,000 back.
    await fund(bob, parse("1000"));
    await vault.connect(bob).deposit(parse("1000"), bob.address);
    const bobShares = await vault.balanceOf(bob.address);
    expect(bobShares).to.be.lt(parse("100")); // far fewer shares at the high price
    const bobBefore = await musd.balanceOf(bob.address);
    await vault.connect(bob).redeem(bobShares, bob.address, bob.address);
    const bobGot = (await musd.balanceOf(bob.address)) - bobBefore;
    expect(bobGot).to.be.closeTo(parse("1000"), parse("5"));

    // Attacker redeems everything: gets back ~what they put in (1 deposit +
    // 10,000 donation) — zero profit from Bob. The donation is theirs to
    // reclaim; the OZ virtual-share offset stops the classic attack where a
    // dust first deposit mints a full share before the donation.
    const attackerShares = await vault.balanceOf(attacker.address);
    const attackerBefore = await musd.balanceOf(attacker.address);
    await vault.connect(attacker).redeem(attackerShares, attacker.address, attacker.address);
    const attackerGot = (await musd.balanceOf(attacker.address)) - attackerBefore;
    expect(attackerGot).to.be.closeTo(parse("10001"), parse("5"));
  });

  it("yield left behind by an early exiter stays for remaining holders", async function () {
    await fund(alice, parse("1000"));
    await vault.connect(alice).deposit(parse("1000"), alice.address);
    await fund(bob, parse("1000"));
    await vault.connect(bob).deposit(parse("1000"), bob.address);

    await musd.mint(await smusd.getAddress(), parse("180")); // 10% on 1800 invested
    await smusd.accrueYield(parse("180"));

    // Alice exits BEFORE compounding: she gets principal only.
    await vault.connect(alice).redeem(await vault.balanceOf(alice.address), alice.address, alice.address);
    expect(await musd.balanceOf(alice.address)).to.be.closeTo(parse("1000"), parse("0.01"));

    // Bob compounds afterwards and captures the whole yield.
    await vault.compound();
    const bobBefore = await musd.balanceOf(bob.address);
    await vault.connect(bob).redeem(await vault.balanceOf(bob.address), bob.address, bob.address);
    const bobGot = (await musd.balanceOf(bob.address)) - bobBefore;
    expect(bobGot).to.be.closeTo(parse("1180"), parse("0.01"));
  });

  it("mint + withdraw (asset-based) round trip works", async function () {
    await fund(alice, parse("1000"));
    const shares = await vault.connect(alice).mint.staticCall(parse("500"), alice.address);
    await vault.connect(alice).mint(parse("500"), alice.address);
    expect(await vault.balanceOf(alice.address)).to.equal(shares);

    // Alice funded 1000, paid 500 for the mint, so she holds 500 before this.
    const before = await musd.balanceOf(alice.address);
    await vault.connect(alice).withdraw(parse("250"), alice.address, alice.address);
    expect((await musd.balanceOf(alice.address)) - before).to.equal(parse("250"));
  });
});
