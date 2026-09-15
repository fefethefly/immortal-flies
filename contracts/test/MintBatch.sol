// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IMintPrototype {
    function mint(uint32 seed) external returns (uint256);
}

/// @dev Test-only receiver to exercise all 1024 mints in bounded local batches.
contract MintBatch {
    function mintMany(address target, uint256 count) external {
        for (uint256 i; i < count; ++i) IMintPrototype(target).mint(uint32(i + 1));
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
