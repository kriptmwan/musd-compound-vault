// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ISMUSD — minimal interface of Mezo's MUSD Savings Rate vault (sMUSD)
/// @notice Verified live on Mezo testnet (chain 31611) and mainnet (chain 31612):
///  - Testnet sMUSD: 0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16
///  - Mainnet sMUSD: 0xb4D498029af77680cD1eF828b967f010d06C51CC
///  - musdToken() returns the MUSD token on both chains (verified via eth_call).
///  - deposit() mints sMUSD 1:1 for MUSD; withdraw() burns sMUSD and returns
///    the principal MUSD; yield accrued separately is paid out by claimYield()
///    (see Mezo docs "MUSD Savings Vault" and Doji's integration notes).
///  - yieldIndex() is the cumulative MUSD yield per 1 sMUSD (1e18 scale).
interface ISMUSD is IERC20 {
    /// @notice The MUSD token this vault accepts.
    function musdToken() external view returns (address);

    /// @notice Cumulative MUSD yield per 1 sMUSD, scaled by 1e18.
    function yieldIndex() external view returns (uint256);

    /// @notice Deposit MUSD, receive sMUSD 1:1. Caller must approve MUSD first.
    function deposit(uint256 amount) external;

    /// @notice Burn sMUSD shares, receive the same amount of MUSD principal.
    function withdraw(uint256 shares) external;

    /// @notice Pay out the caller's accrued MUSD yield to the caller.
    function claimYield() external;
}
