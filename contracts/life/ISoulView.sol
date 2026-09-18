// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Read surface SoulRenderer uses for tokenURI. Field order must match ImmortalSoul.
interface ISoulView {
    struct Genome {
        uint32 seed;
        uint64 bornAt;
        uint64 bornBlock;
        uint16 lookVersion;
    }
    struct Descent {
        uint256 parentA;
        uint256 parentB;
        uint32 generation;
    }

    function getGenome(uint256 id) external view returns (Genome memory);
    function givenName(uint256 id) external view returns (string memory);
    function getDescent(uint256 id) external view returns (Descent memory);
    function lifeId(uint256 id) external view returns (bytes32);
    function genesisRoot() external view returns (bytes32);
    function genomeHash(uint256 id) external view returns (bytes32);
}
