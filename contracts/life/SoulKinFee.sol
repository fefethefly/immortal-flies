// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ImmortalSoul} from "./ImmortalSoul.sol";
import {IKinBuyAdapter} from "./IKinBuyAdapter.sol";

/// @notice Replaceable paid pedigree module. See docs/SOULKIN-FEE.md.
/// @dev Does not move Soul identities. Buy failure must not roll back mintDescendant.
contract SoulKinFee is ReentrancyGuard {
    uint256 public constant MAX_BREED_PRICE = 0.1 ether;
    uint8 public constant HOLD_NO_ADAPTER = 1;
    uint8 public constant HOLD_ADAPTER_REVERT = 2;
    uint8 public constant HOLD_ZERO_OUT = 3;
    address public constant MAINNET_IFS = 0x65b66BB4Adb0e244E19d290b6AAa0381B81A7777;
    address public constant MAINNET_HIVE = 0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467;
    address public constant MAINNET_OPS = 0x055bB2aF42B832A55F3D708c92824C491dE05427;

    ImmortalSoul public immutable soul;
    address public immutable ifs;
    address public immutable hive;
    address public operator;
    uint256 public breedPrice;
    address public adapter;
    uint256 public requestCount;
    uint256 public pendingCount;
    uint256 public heldBNB;

    struct Request {
        address recipient;
        uint256 parentA;
        uint256 parentB;
        uint64 entropyBlock;
        uint256 paid;
    }

    mapping(uint256 => Request) public requests;
    mapping(address => uint256) public pendingRequest;
    mapping(address => uint256) public refunds;

    event BreedRequested(
        uint256 indexed requestId,
        address indexed recipient,
        uint256 parentA,
        uint256 parentB,
        uint256 entropyBlock,
        uint256 paid
    );
    event BreedExpired(uint256 indexed requestId, address indexed recipient, uint256 refunded);
    event BreedBuyFilled(uint256 indexed requestId, uint256 paid, uint256 amountOut, address sink);
    event BreedBuyHeld(uint256 indexed requestId, uint256 paid, uint8 reason);
    event RefundHeld(address indexed recipient, uint256 amount);
    event HeldBnbSwept(address indexed to, uint256 amount);
    event BreedPriceSet(uint256 price);
    event BuyAdapterSet(address adapter);
    event OperatorChanged(address operator);

    error Unauthorized();
    error PendingBreed();
    error BreedNotReady();
    error BreedUnavailable();
    error InvalidPair();
    error WrongFee();
    error PriceCap();
    error BadSweep();

    constructor(address collection, address ifsToken, address hiveSink) {
        if (collection.code.length == 0 || ifsToken == address(0) || hiveSink == address(0)) revert InvalidPair();
        if (hiveSink == ifsToken || hiveSink == MAINNET_OPS) revert InvalidPair();
        if (block.chainid == 56 && (ifsToken != MAINNET_IFS || hiveSink != MAINNET_HIVE)) revert InvalidPair();
        soul = ImmortalSoul(collection);
        ifs = ifsToken;
        hive = hiveSink;
        operator = msg.sender;
        emit OperatorChanged(msg.sender);
    }

    function setOperator(address next) external {
        if (msg.sender != operator) revert Unauthorized();
        operator = next;
        emit OperatorChanged(next);
    }

    function setBreedPrice(uint256 next) external {
        if (msg.sender != operator) revert Unauthorized();
        if (next > MAX_BREED_PRICE) revert PriceCap();
        breedPrice = next;
        emit BreedPriceSet(next);
    }

    function setAdapter(address next) external {
        if (msg.sender != operator) revert Unauthorized();
        adapter = next;
        emit BuyAdapterSet(next);
    }

    function requestBreed(uint256 parentA, uint256 parentB) external payable nonReentrant returns (uint256 id) {
        if (msg.value != breedPrice) revert WrongFee();
        if (parentA == 0 || parentB == 0 || parentA == parentB) revert InvalidPair();
        if (soul.ownerOf(parentA) != msg.sender || soul.ownerOf(parentB) != msg.sender) revert Unauthorized();
        if (pendingRequest[msg.sender] != 0) revert PendingBreed();
        id = ++requestCount;
        requests[id] = Request(msg.sender, parentA, parentB, uint64(block.number + 2), msg.value);
        pendingRequest[msg.sender] = id;
        ++pendingCount;
        emit BreedRequested(id, msg.sender, parentA, parentB, block.number + 2, msg.value);
    }

    function breed(uint256 id) external nonReentrant returns (uint256 tokenId) {
        Request memory req = requests[id];
        if (req.recipient == address(0)) revert BreedUnavailable();
        if (block.number <= req.entropyBlock) revert BreedNotReady();
        bytes32 entropy = blockhash(req.entropyBlock);
        if (entropy == 0) revert BreedUnavailable();
        if (soul.ownerOf(req.parentA) != req.recipient || soul.ownerOf(req.parentB) != req.recipient) revert Unauthorized();
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
        delete requests[id];
        delete pendingRequest[req.recipient];
        --pendingCount;
        if (req.paid != 0) _tryBuy(id, req.paid);
    }

    function expireBreed(uint256 id) external nonReentrant {
        Request memory req = requests[id];
        if (req.recipient == address(0) || block.number <= uint256(req.entropyBlock) + 256) revert BreedUnavailable();
        delete requests[id];
        delete pendingRequest[req.recipient];
        --pendingCount;
        emit BreedExpired(id, req.recipient, req.paid);
        _sendOrHoldRefund(req.recipient, req.paid);
    }

    function withdrawRefund() external nonReentrant {
        uint256 amount = refunds[msg.sender];
        if (amount == 0) revert BadSweep();
        refunds[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) {
            refunds[msg.sender] = amount;
            revert BadSweep();
        }
    }

    function retryHeldBuy(uint256 amount) external nonReentrant {
        if (amount == 0 || amount > heldBNB || adapter == address(0)) revert BadSweep();
        heldBNB -= amount;
        _tryBuy(0, amount);
    }

    function flushHeldBnb() external nonReentrant {
        uint256 amount = heldBNB;
        if (amount == 0) revert BadSweep();
        heldBNB = 0;
        (bool ok, ) = hive.call{value: amount}("");
        if (!ok) {
            heldBNB = amount;
            revert BadSweep();
        }
        emit HeldBnbSwept(hive, amount);
    }

    function _tryBuy(uint256 requestId, uint256 paid) private {
        address buy = adapter;
        if (buy == address(0)) {
            heldBNB += paid;
            emit BreedBuyHeld(requestId, paid, HOLD_NO_ADAPTER);
            return;
        }
        try IKinBuyAdapter(buy).buyToSink{value: paid}(ifs, hive, 0) returns (uint256 out) {
            if (out == 0) {
                // Call kept the BNB; do not invent held balance.
                emit BreedBuyHeld(requestId, paid, HOLD_ZERO_OUT);
                return;
            }
            emit BreedBuyFilled(requestId, paid, out, hive);
        } catch {
            heldBNB += paid;
            emit BreedBuyHeld(requestId, paid, HOLD_ADAPTER_REVERT);
        }
    }

    function _sendOrHoldRefund(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (ok) return;
        refunds[to] += amount;
        emit RefundHeld(to, amount);
    }

    receive() external payable {
        revert BadSweep();
    }

    fallback() external payable {
        revert BadSweep();
    }
}
