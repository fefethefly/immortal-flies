// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockIFS {
    string public name = "MockIFS";
    string public symbol = "MIFS";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
