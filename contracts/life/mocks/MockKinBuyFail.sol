// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockKinBuyFail {
    function buyToSink(address, address, uint256) external payable returns (uint256) {
        revert("buy-fail");
    }
}
