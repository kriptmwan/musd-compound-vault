// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MockSMUSD — test stand-in for Mezo's MUSD Savings Rate vault (sMUSD)
/// @notice Models the DOCUMENTED + live-verified behaviour of the real vault:
///  - deposit(amount MUSD) mints the same amount of sMUSD (1:1).
///  - withdraw(shares) burns sMUSD and returns the same amount of MUSD
///    principal. Accrued yield is NOT paid by withdraw.
///  - Yield accrues per sMUSD via yieldIndex (cumulative MUSD per 1 sMUSD,
///    1e18 scale). claimYield() pays the caller's accrued MUSD.
///  - Transferring sMUSD settles the sender's accrued yield first (mirrors
///    the real vault's _beforeTokenTransfer finalisation, Halborn 7.2).
///  - musdToken() returns the MUSD token address.
///
/// Differences from the real vault (documented, not hidden):
///  - Yield is injected by tests via accrueYield() after funding this
///    contract with MUSD; the real vault receives protocol fees weekly.
///  - The real vault enforces a minimum deposit duration (Halborn 7.1 fix);
///    this mock does not, because the vault under test holds sMUSD
///    long-term and never churns it. The min-duration behaviour must be
///    confirmed on a Mezo testnet fork before mainnet use (see DESIGN.md).
contract MockSMUSD is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public immutable musd;

    /// @notice Cumulative MUSD yield per 1 sMUSD, 1e18 scale.
    uint256 public yieldIndex;

    mapping(address => uint256) public userIndex;
    mapping(address => uint256) public claimable;

    event YieldAccrued(uint256 amount, uint256 newIndex);
    event YieldClaimed(address indexed user, uint256 amount);

    constructor(IERC20 musd_) ERC20("MUSD Savings Rate", "sMUSD") {
        musd = musd_;
    }

    function musdToken() external view returns (address) {
        return address(musd);
    }

    /// @notice Deposit MUSD, receive sMUSD 1:1.
    function deposit(uint256 amount) external {
        _settle(msg.sender);
        musd.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
    }

    /// @notice Burn sMUSD, receive the same amount of MUSD principal.
    /// Accrued yield stays claimable via claimYield().
    function withdraw(uint256 shares) external {
        _settle(msg.sender);
        _burn(msg.sender, shares);
        musd.safeTransfer(msg.sender, shares);
    }

    /// @notice Pay out the caller's accrued MUSD yield.
    function claimYield() external {
        _settle(msg.sender);
        uint256 amount = claimable[msg.sender];
        if (amount == 0) return;
        claimable[msg.sender] = 0;
        musd.safeTransfer(msg.sender, amount);
        emit YieldClaimed(msg.sender, amount);
    }

    /// @notice TEST ONLY: simulate a weekly protocol-fee distribution.
    /// The caller must have funded this contract with `amount` MUSD first.
    /// Increases the index by amount / totalSupply (1e18 scale).
    function accrueYield(uint256 amount) external {
        uint256 supply = totalSupply();
        require(supply > 0, "no supply");
        yieldIndex += (amount * 1e18) / supply;
        emit YieldAccrued(amount, yieldIndex);
    }

    /// @notice Preview of a user's currently accrued (unclaimed) yield.
    function accruedYield(address user) external view returns (uint256) {
        uint256 pending = (balanceOf(user) * (yieldIndex - userIndex[user])) / 1e18;
        return claimable[user] + pending;
    }

    function _settle(address user) internal {
        if (user == address(0)) return;
        uint256 pending = (balanceOf(user) * (yieldIndex - userIndex[user])) / 1e18;
        if (pending > 0) claimable[user] += pending;
        userIndex[user] = yieldIndex;
    }

    /// @dev Settle both sides of every transfer, like the real vault's
    /// _beforeTokenTransfer hook (Halborn finding 7.2).
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0)) _settle(from);
        if (to != address(0)) _settle(to);
        super._update(from, to, value);
    }
}
