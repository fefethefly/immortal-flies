// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Optional hatch permit. Can only deny; empty module means open.
interface IHatchGate {
    function allowHatch(address who, string calldata given, bytes calldata proof) external view returns (bool);
}
