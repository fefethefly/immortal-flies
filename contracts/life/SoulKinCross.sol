// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ImmortalSoul} from "./ImmortalSoul.sol";
import {KinCrossover} from "./KinCrossover.sol";
import {KinClock} from "./KinClock.sol";

/// @notice Free pedigree module with crossover descent. See docs/LIFE-PROTOCOL.md.
/// @dev 每个位点取自一位亲本，约 2% 突变。子代 seed 由完成者在链下从确定性
///      血裔候选流中研磨出全中候选，breed(id, n) 只做一次解码验证 —— gas 与
///      旧 SoulKin 同量级。替换 MODULE_KIN 即启用，不动 Soul。
contract SoulKinCross {
    ImmortalSoul public immutable soul;
    address public operator;
    uint64 public breedCooldown;
    uint256 public requestCount;
    uint256 public pendingCount;
    struct Request { address recipient; uint256 parentA; uint256 parentB; uint64 entropyBlock; }
    mapping(uint256 => Request) public requests;
    mapping(address => uint256) public pendingRequest;
    mapping(uint256 => uint64) public lastBredAt;

    event BreedRequested(uint256 indexed requestId, address indexed recipient, uint256 parentA, uint256 parentB, uint256 entropyBlock);
    event BreedExpired(uint256 indexed requestId, address indexed recipient);
    event BreedCooldownSet(uint64 cooldown);
    event OperatorChanged(address operator);

    error Unauthorized();
    error PendingBreed();
    error BreedNotReady();
    error BreedUnavailable();
    error InvalidPair();

    constructor(address collection) {
        if (collection.code.length == 0) revert InvalidPair();
        soul = ImmortalSoul(collection);
        operator = msg.sender;
        breedCooldown = KinClock.DEFAULT_COOLDOWN;
        emit OperatorChanged(msg.sender);
        emit BreedCooldownSet(breedCooldown);
    }

    function setOperator(address next) external {
        if (msg.sender != operator) revert Unauthorized();
        operator = next;
        emit OperatorChanged(next);
    }

    function setBreedCooldown(uint64 next) external {
        if (msg.sender != operator) revert Unauthorized();
        breedCooldown = KinClock.setCooldown(next);
        emit BreedCooldownSet(breedCooldown);
    }

    /// @dev 前端用这个标记识别交叉规则模块（旧模块没有这个入口）。
    function CROSSOVER_RULE() external pure returns (string memory) {
        return "ifs.descent-cross/1";
    }

    function requestBreed(uint256 parentA, uint256 parentB) external returns (uint256 id) {
        if (parentA == 0 || parentB == 0 || parentA == parentB) revert InvalidPair();
        if (soul.ownerOf(parentA) != msg.sender || soul.ownerOf(parentB) != msg.sender) revert Unauthorized();
        if (pendingRequest[msg.sender] != 0) revert PendingBreed();
        KinClock.check(lastBredAt, parentA, parentB, breedCooldown);
        id = ++requestCount;
        requests[id] = Request(msg.sender, parentA, parentB, uint64(block.number + 2));
        pendingRequest[msg.sender] = id;
        ++pendingCount;
        emit BreedRequested(id, msg.sender, parentA, parentB, block.number + 2);
    }

    /// @notice n 是血裔候选流的序号（完成者链下研磨得到）。任何人可完成。
    function breed(uint256 id, uint256 n) external returns (uint256 tokenId) {
        Request memory req = requests[id];
        if (req.recipient == address(0)) revert BreedUnavailable();
        if (block.number <= req.entropyBlock) revert BreedNotReady();
        bytes32 entropy = blockhash(req.entropyBlock);
        if (entropy == 0) revert BreedUnavailable();
        if (soul.ownerOf(req.parentA) != req.recipient || soul.ownerOf(req.parentB) != req.recipient) revert Unauthorized();
        KinClock.check(lastBredAt, req.parentA, req.parentB, breedCooldown);
        delete requests[id];
        delete pendingRequest[req.recipient];
        --pendingCount;
        ImmortalSoul.Genome memory a = soul.getGenome(req.parentA);
        ImmortalSoul.Genome memory b = soul.getGenome(req.parentB);
        KinCrossover.Descent memory out =
            KinCrossover.verifyChild(a.seed, b.seed, entropy, address(soul), id, n);
        tokenId = soul.mintDescendant(req.recipient, out.seed, req.parentA, req.parentB);
        KinClock.stamp(lastBredAt, req.parentA, req.parentB);
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
