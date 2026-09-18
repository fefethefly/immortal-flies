// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice 1% tax token for MiningHub pull-by-balance tests. Not the live IFS.
contract MockIFSTax {
    string public name = "MockIFSTax";
    string public symbol = "TIFS";
    uint8 public decimals = 18;
    uint16 public constant TAX_BPS = 100;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        uint256 tax = (amount * TAX_BPS) / 10_000;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - tax;
    }
}
