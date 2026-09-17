// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {MockIFS} from "./MockIFS.sol";

contract MockKinBuyOk {
    MockIFS public immutable token;

    constructor(address ifs) {
        token = MockIFS(ifs);
    }

    function buyToSink(address ifs, address sink, uint256) external payable returns (uint256 out) {
        if (ifs != address(token) || sink == address(0) || msg.value == 0) revert("bad-buy");
        out = msg.value;
        token.mint(sink, out);
        (bool ok, ) = address(0x000000000000000000000000000000000000dEaD).call{value: msg.value}("");
        if (!ok) revert("bnb");
    }
}
