// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockHatchGate {
    bool public ok = true;

    function setOk(bool next) external {
        ok = next;
    }

    function allowHatch(address, string calldata, bytes calldata) external view returns (bool) {
        return ok;
    }
}
