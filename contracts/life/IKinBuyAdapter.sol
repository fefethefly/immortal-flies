// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Replaceable buy route for SoulKinFee. Kin calls this in try/catch after birth.
interface IKinBuyAdapter {
    /// @dev Spend all msg.value buying `ifs`, send tokens to `sink`. Revert on failure.
    ///      Do not leave BNB on this contract; leftover must go to `sink` or the call must revert.
    function buyToSink(address ifs, address sink, uint256 minOut)
        external
        payable
        returns (uint256 amountOut);
}
