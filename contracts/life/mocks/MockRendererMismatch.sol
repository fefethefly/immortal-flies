// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Same locus width as /3, different first byte, so a prefix challenge must fire.
contract MockRendererMismatch {
    function version() external pure returns (uint16) {
        return 99;
    }

    function loci(uint32) external pure returns (bytes memory out) {
        out = new bytes(11);
        out[0] = bytes1(0xff);
    }

    function tokenURI(address, uint256) external pure returns (string memory) {
        return "";
    }

    function decode(uint32) external pure returns (bytes memory) {
        return "";
    }
}
