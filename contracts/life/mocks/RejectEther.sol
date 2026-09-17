// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISoulKinFee {
    function requestBreed(uint256 parentA, uint256 parentB) external payable returns (uint256);
}

contract RejectEther {
    function requestBreed(address kin, uint256 parentA, uint256 parentB) external payable returns (uint256) {
        return ISoulKinFee(kin).requestBreed{value: msg.value}(parentA, parentB);
    }

    receive() external payable {
        revert("no-bnb");
    }

    fallback() external payable {
        revert("no-bnb");
    }
}
