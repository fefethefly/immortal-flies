// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ImmortalSoul} from "./ImmortalSoul.sol";

/// @notice Replaceable pedigree module. Breed rules can change without moving Soul identities.
contract SoulKin {
    ImmortalSoul public immutable soul;
    uint256 public requestCount;
    uint256 public pendingCount;
    struct Request { address recipient; uint256 parentA; uint256 parentB; uint64 entropyBlock; }
    mapping(uint256 => Request) public requests;
    mapping(address => uint256) public pendingRequest;

    event BreedRequested(uint256 indexed requestId, address indexed recipient, uint256 parentA, uint256 parentB, uint256 entropyBlock);
    event BreedExpired(uint256 indexed requestId, address indexed recipient);

    error Unauthorized();
    error PendingBreed();
    error BreedNotReady();
    error BreedUnavailable();
    error InvalidPair();

    constructor(address collection) {
        if (collection.code.length == 0) revert InvalidPair();
        soul = ImmortalSoul(collection);
    }

    function requestBreed(uint256 parentA, uint256 parentB) external returns (uint256 id) {
        if (parentA == 0 || parentB == 0 || parentA == parentB) revert InvalidPair();
        if (soul.ownerOf(parentA) != msg.sender || soul.ownerOf(parentB) != msg.sender) revert Unauthorized();
        if (pendingRequest[msg.sender] != 0) revert PendingBreed();
        id = ++requestCount;
        requests[id] = Request(msg.sender, parentA, parentB, uint64(block.number + 2));
        pendingRequest[msg.sender] = id;
        ++pendingCount;
        emit BreedRequested(id, msg.sender, parentA, parentB, block.number + 2);
    }

    function breed(uint256 id) external returns (uint256 tokenId) {
        Request memory req = requests[id];
        if (req.recipient == address(0)) revert BreedUnavailable();
        if (block.number <= req.entropyBlock) revert BreedNotReady();
        bytes32 entropy = blockhash(req.entropyBlock);
        if (entropy == 0) revert BreedUnavailable();
        if (soul.ownerOf(req.parentA) != req.recipient || soul.ownerOf(req.parentB) != req.recipient) revert Unauthorized();
        delete requests[id];
        delete pendingRequest[req.recipient];
        --pendingCount;
        ImmortalSoul.Genome memory a = soul.getGenome(req.parentA);
        ImmortalSoul.Genome memory b = soul.getGenome(req.parentB);
        uint32 seed = uint32(uint256(keccak256(abi.encode(
            keccak256("ifs.descent/1"),
            address(soul),
            req.parentA,
            req.parentB,
            a.seed,
            b.seed,
            id,
            entropy
        ))));
        if (seed == 0) seed = 1;
        tokenId = soul.mintDescendant(req.recipient, seed, req.parentA, req.parentB);
    }

    function expireBreed(uint256 id) external {
        Request memory req = requests[id];
        if (req.recipient == address(0) || block.number <= uint256(req.entropyBlock) + 256) revert BreedUnavailable();
        delete requests[id];
        delete pendingRequest[req.recipient];
        --pendingCount;
        emit BreedExpired(id, req.recipient);
    }
}
