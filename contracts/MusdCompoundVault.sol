// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ISMUSD} from "./interfaces/ISMUSD.sol";

/// @title MusdCompoundVault — auto-compounding ERC-4626 vault for MUSD on Mezo
/// @notice Track 1 (DeFi) prototype for the Mezo Buildathon on AKINDO (Wave 2).
///
/// How it works
///  - Users deposit MUSD and receive cMUSD shares (ERC-4626).
///  - The vault keeps a small MUSD buffer for instant redemptions and invests
///    everything above the buffer into Mezo's own MUSD Savings Rate vault
///    (sMUSD), the native yield source for MUSD: yield comes from protocol
///    fees on Bitcoin-backed MUSD loans, distributed weekly.
///  - Yield is NOT priced into the vault until it is realised: anyone may call
///    `compound()`, which claims the vault's accrued sMUSD yield as MUSD and
///    re-deposits it into sMUSD, so yield earns yield. Share price rises only
///    on realised, measured MUSD — the vault never trusts an index or an
///    oracle for its accounting.
///  - Redemptions are served from the buffer first. If the buffer is short,
///    the vault claims yield first, then withdraws principal from sMUSD.
///    Withdrawing sMUSD returns principal 1:1; accrued yield is always
///    claimed before any sMUSD withdrawal so it is never left behind.
///
/// Safety notes
///  - No oracle, no swap, no leverage, no external protocol besides sMUSD.
///  - Deposits can be paused by the owner; withdrawals can NEVER be paused.
///  - The owner can only tune the buffer (max 50%), the performance fee
///    (max 10% of harvested yield, default 0), and the fee recipient.
///    The owner cannot move user funds or block withdrawals.
///  - Inflation / first-depositor donation resistance comes from
///    OpenZeppelin ERC4626's virtual-share offset.
///  - sMUSD enforces a minimum deposit duration (Halborn audit fix). The
///    vault's sMUSD position is long-lived by design and redemptions are
///    served from the buffer, so normal use never churns the sMUSD position.
contract MusdCompoundVault is ERC4626, ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_BUFFER_BPS = 5_000; // 50%
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 1_000; // 10% of yield

    /// @notice Mezo's MUSD Savings Rate vault (sMUSD).
    ISMUSD public immutable sMUSD;

    /// @notice Share of total assets kept as idle MUSD for instant redemptions.
    uint256 public bufferBps;

    /// @notice Fee taken from harvested yield at compound() time, in bps.
    uint256 public performanceFeeBps;

    /// @notice Where performance fees go. Defaults to the deployer.
    address public feeRecipient;

    event Invested(uint256 amount);
    event Freed(uint256 smusdShares, uint256 musdReceived);
    event Compounded(uint256 harvested, uint256 fee, uint256 reinvested);
    event BufferUpdated(uint256 oldBps, uint256 newBps);
    event PerformanceFeeUpdated(uint256 oldBps, uint256 newBps);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    error BufferTooHigh();
    error FeeTooHigh();
    error ZeroAddress();

    /// @param musd_ MUSD token (asset). Testnet 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503,
    ///  mainnet 0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186.
    /// @param smusd_ sMUSD vault. Testnet 0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16,
    ///  mainnet 0xb4D498029af77680cD1eF828b967f010d06C51CC.
    /// @param bufferBps_ Initial buffer, e.g. 1000 = 10%.
    constructor(
        IERC20 musd_,
        ISMUSD smusd_,
        uint256 bufferBps_
    ) ERC4626(musd_) ERC20("Compound MUSD Vault Share", "cMUSD") Ownable(msg.sender) {
        if (address(smusd_) == address(0)) revert ZeroAddress();
        if (smusd_.musdToken() != address(musd_)) revert ZeroAddress();
        if (bufferBps_ > MAX_BUFFER_BPS) revert BufferTooHigh();
        sMUSD = smusd_;
        bufferBps = bufferBps_;
        feeRecipient = msg.sender;
    }

    // ------------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------------

    /// @notice Idle MUSD held for instant redemptions.
    function idle() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice sMUSD shares held (principal, 1 sMUSD == 1 MUSD of principal).
    function invested() public view returns (uint256) {
        return sMUSD.balanceOf(address(this));
    }

    /// @notice Target idle MUSD given the current buffer setting.
    function bufferTarget() public view returns (uint256) {
        return (totalAssets() * bufferBps) / BPS_DENOMINATOR;
    }

    /// @notice sMUSD cumulative yield index (1e18 scale), passthrough.
    function yieldIndex() public view returns (uint256) {
        return sMUSD.yieldIndex();
    }

    /// @notice Total assets: idle MUSD + sMUSD principal. Unclaimed sMUSD
    /// yield is deliberately NOT counted until compound() realises it.
    function totalAssets() public view override returns (uint256) {
        return idle() + invested();
    }

    // ------------------------------------------------------------------------
    // ERC-4626 entry points (non-reentrant; deposits pausable, exits never)
    // ------------------------------------------------------------------------

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256)
    {
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256)
    {
        return super.redeem(shares, receiver, owner);
    }

    /// @notice Realise accrued sMUSD yield and re-deposit it. Permissionless:
    /// anyone may call it, it only ever moves the vault's own yield, and it
    /// is a no-op when nothing has accrued. A performance fee (default 0)
    /// is taken from the harvested amount only.
    function compound() external nonReentrant {
        uint256 before = idle();
        sMUSD.claimYield();
        uint256 harvested = idle() - before;

        uint256 fee = 0;
        if (harvested > 0 && performanceFeeBps > 0) {
            fee = (harvested * performanceFeeBps) / BPS_DENOMINATOR;
            if (fee > 0) {
                IERC20(asset()).safeTransfer(feeRecipient, fee);
            }
        }

        _investExcess();
        emit Compounded(harvested, fee, harvested - fee);
    }

    // ------------------------------------------------------------------------
    // Admin (owner cannot move funds or block withdrawals)
    // ------------------------------------------------------------------------

    function setBufferBps(uint256 newBps) external onlyOwner {
        if (newBps > MAX_BUFFER_BPS) revert BufferTooHigh();
        emit BufferUpdated(bufferBps, newBps);
        bufferBps = newBps;
        _investExcess();
    }

    function setPerformanceFeeBps(uint256 newBps) external onlyOwner {
        if (newBps > MAX_PERFORMANCE_FEE_BPS) revert FeeTooHigh();
        emit PerformanceFeeUpdated(performanceFeeBps, newBps);
        performanceFeeBps = newBps;
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    /// @notice Pauses deposits only. Withdrawals and redemptions keep working.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ------------------------------------------------------------------------
    // Internal accounting
    // ------------------------------------------------------------------------

    /// @dev After funds arrive (deposit/mint/compound/buffer change), invest
    /// idle MUSD above the buffer target into sMUSD.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
    {
        super._deposit(caller, receiver, assets, shares);
        _investExcess();
    }

    /// @dev Before paying a redemption out, make sure enough idle MUSD exists:
    /// claim yield first, then withdraw principal from sMUSD if still short.
    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        _freeFunds(assets);
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    function _investExcess() internal {
        uint256 target = bufferTarget();
        uint256 idleNow = idle();
        if (idleNow <= target) return;
        uint256 invest = idleNow - target;
        IERC20(asset()).forceApprove(address(sMUSD), invest);
        sMUSD.deposit(invest);
        emit Invested(invest);
    }

    function _freeFunds(uint256 needed) internal {
        uint256 idleNow = idle();
        if (idleNow >= needed) return;

        // Realise accrued yield first so a later sMUSD withdrawal never
        // strands yield behind.
        sMUSD.claimYield();
        idleNow = idle();
        if (idleNow >= needed) return;

        uint256 shortfall = needed - idleNow;
        uint256 sharesToWithdraw = shortfall; // sMUSD principal is 1:1 MUSD
        uint256 held = invested();
        if (sharesToWithdraw > held) sharesToWithdraw = held;
        uint256 before = idle();
        sMUSD.withdraw(sharesToWithdraw);
        uint256 received = idle() - before;
        emit Freed(sharesToWithdraw, received);
    }
}
