// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMiningSoul {
    function ownerOf(uint256) external view returns (address);
    function canControl(uint256, address) external view returns (bool);
    function controlEpoch(uint256) external view returns (uint256);
    function modelHash() external view returns (bytes32);
    function lifeId(uint256) external view returns (bytes32);
}
interface ILifeJournal {
    function soul() external view returns (address);
    function heads(uint256) external view returns (uint64, uint64, uint64, bytes32, bytes32);
}

/// @notice Private-track fuel and segment settlement. See docs/MINING-HUB-V1.md.
/// @dev Independent satellite. Not a Soul module. Do not setModule.
///      Does not run MaleCNS. Pay only after opening + challenge window.
///      Mismatch after dispute timeout is NEITHER. Optional arbiter may
///      finalize after the same timeout. Slash never happens on hash mismatch alone.
contract MiningHub is ReentrancyGuard {
    uint8 public constant ROLE_RUNNER = 1;
    uint8 public constant ROLE_KEEPER = 2;
    uint8 public constant OP_ACTIVE = 1;
    uint8 public constant OP_EXITING = 2;
    uint8 public constant OP_EXITED = 3;
    uint8 public constant SEG_OPEN = 1;
    uint8 public constant SEG_COMMITTED = 2;
    uint8 public constant SEG_CHALLENGED = 3;
    uint8 public constant SEG_SETTLED = 4;
    uint8 public constant SEG_SLASHED = 5;
    uint8 public constant SEG_VOID = 6;
    uint8 public constant VERDICT_RUNNER = 0;
    uint8 public constant VERDICT_CHALLENGER = 1;
    uint8 public constant VERDICT_NEITHER = 2;
    uint16 public constant MAX_STEPS = 1000;
    uint16 public constant MAX_BOND_MULTIPLE = 20;
    uint256 public constant EXIT_COOLDOWN = 7 days;
    address public constant MAINNET_IFS = 0x65b66BB4Adb0e244E19d290b6AAa0381B81A7777;
    address public constant MAINNET_HIVE = 0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467;
    address public constant MAINNET_OPS = 0x055bB2aF42B832A55F3D708c92824C491dE05427;

    IMiningSoul public immutable soul;
    ILifeJournal public immutable journal;
    IERC20 public immutable ifs;
    address public immutable hive;
    address public operator;
    address public arbiter;
    bool public paused;
    uint256 public maxFeePerSegment;
    uint256 public minBond;
    uint256 public bondMultiple;
    uint256 public challengeWindow;
    uint256 public challengeBond;
    uint256 public maxUserDaily;
    uint256 public maxProtocolDaily;
    uint32 public spendDay;
    uint256 public daySpend;

    struct Tank {
        address owner;
        bytes32 lifeId;
        uint256 ownerFuel;
        uint256 giftFuel;
        uint256 reserved;
        address runner;
        uint256 fee;
        uint16 steps;
        uint256 spendCap;
        uint256 spent;
        uint64 validUntil;
    }
    struct Operator {
        uint8 roles;
        uint8 status;
        uint256 bond;
        uint256 exposure;
        uint64 unlockAt;
        uint32 accepted;
        uint32 disputed;
        uint32 lost;
    }
    struct Commitment {
        uint16 steps;
        uint16 checkpointEvery;
        uint16 leafEvery;
        bytes32 startRoot;
        bytes32 finalRoot;
        bytes32 trajectoryRoot;
        bytes32 checkpointPack;
    }
    struct Segment {
        uint256 tokenId;
        bytes32 lifeId;
        address runner;
        uint16 steps;
        uint8 status;
        uint256 fee;
        uint256 fromOwner;
        uint256 fromGift;
        uint256 exposure;
        bytes32 startRoot;
        bytes32 finalRoot;
        bytes32 trajectoryRoot;
        bytes32 archiveHash;
        uint64 journalSequence;
        uint64 commitBlock;
        uint64 challengeUntil;
        bytes32 seed;
        bytes32 openingHash;
        uint256 paid;
        address challenger;
        uint64 disputeAt;
        uint8 runnerVerdict;
        uint8 challengerVerdict;
        bytes32 runnerRecord;
        bytes32 challengerRecord;
        bool runnerSubmitted;
        bool challengerSubmitted;
        address funder;
        uint64 inputFrom;
        uint64 inputTo;
        bytes32 inputRoot;
        bytes32 workKey;
        uint256 snapBond;
        uint64 snapWindow;
        bytes32 prevSettled;
    }
    struct Work {
        uint32 accepted;
        uint32 disputed;
        uint32 slashed;
    }

    mapping(uint256 => Tank) public tanks;
    mapping(address => Operator) public operators;
    mapping(bytes32 => Segment) public segments;
    mapping(address => uint256) public earnings;
    mapping(address => uint256) public refunds;
    mapping(uint256 => Work) public workOf;
    mapping(address => bool) public allowlisted;
    mapping(uint256 => bytes32) public activeLease;
    mapping(bytes32 => bool) public workClaimed;
    mapping(uint256 => bytes32) public lastFinalRoot;
    mapping(uint256 => bytes32) public lastSettledId;
    mapping(bytes32 => bool) public revoked;
    mapping(bytes32 => bool) public revokedHead;
    mapping(address => uint256) public userDaySpend;
    mapping(address => uint32) public userSpendDay;

    event OperatorRegistered(address indexed who, uint8 roles, uint256 bond);
    event BondChanged(address indexed who, uint256 bond, uint256 exposure);
    event TankFueled(uint256 indexed tokenId, bytes32 lifeId, uint8 kind, uint256 received, uint256 ownerFuel, uint256 giftFuel);
    event OwnerRefunded(uint256 indexed tokenId, address indexed oldOwner, uint256 amount);
    event RunnerBound(uint256 indexed tokenId, address indexed runner, uint256 fee, uint16 steps, uint256 spendCap, uint64 validUntil);
    event SegmentOpened(bytes32 indexed id, uint256 indexed tokenId, address runner, uint256 fee, uint16 steps, bytes32 startRoot);
    event SegmentCommitted(bytes32 indexed id, bytes32 trajectoryRoot, bytes32 finalRoot, bytes32 archiveHash, uint256 commitBlock);
    event SeedLocked(bytes32 indexed id, bytes32 seed, uint256 sourceBlock);
    event OpeningRecorded(bytes32 indexed id, bytes32 openingHash);
    event SegmentSettled(bytes32 indexed id, address indexed runner, uint256 paid);
    event SegmentVoided(bytes32 indexed id);
    event DisputeOpened(bytes32 indexed id, address indexed challenger);
    event VerdictSubmitted(bytes32 indexed id, address indexed by, uint8 verdict, bytes32 recordHash);
    event SegmentSlashed(bytes32 indexed id, address indexed loser, uint256 amount, address sink);
    event TaxObserved(address indexed from, uint256 requested, uint256 received);
    event Paused(bool paused);
    event OperatorChanged(address next);
    event ArbiterChanged(address next);
    event Allowlisted(address indexed who, bool ok);
    event LimitsChanged(uint256 maxFee, uint256 minBond, uint256 bondMultiple, uint256 challengeWindow, uint256 challengeBond);
    event SpendLimitsChanged(uint256 maxUserDaily, uint256 maxProtocolDaily);
    event AcceptanceRevoked(bytes32 indexed id, uint256 indexed tokenId, bytes32 restoredHead);

    error Unauthorized();
    error PausedHub();
    error BadConfig();
    error BadStatus();
    error BadArchive();
    error StaleEpoch();
    error NotOwner();
    error NotActive();
    error AlreadyRegistered();
    error BondLow();
    error Exposed();
    error Cooldown();
    error NotExiting();
    error ZeroIn();
    error Insufficient();
    error FeeCap();
    error LimitCap();
    error Unbound();
    error TankEmpty();
    error DupSegment();
    error TooEarly();
    error SeedExpired();
    error NoSeed();
    error AlreadyPaid();
    error WindowOpen();
    error WindowClosed();
    error SelfDispute();
    error NoDispute();
    error Mismatch();
    error WrongLife();
    error WrongJournal();
    error NotAllowlisted();
    error LeaseHeld();
    error WorkTaken();
    error NeedContinuity();
    error NoOpening();
    error WrongSteps();
    error CapExceeded();
    error OrderExpired();
    error DayCap();
    error RevokedLine();

    constructor(address soul_, address journal_, address ifs_, address hive_) {
        if (soul_.code.length == 0 || journal_.code.length == 0 || ifs_ == address(0) || hive_ == address(0)) revert BadConfig();
        if (hive_ == ifs_ || hive_ == MAINNET_OPS) revert BadConfig();
        if (block.chainid == 56 && (ifs_ != MAINNET_IFS || hive_ != MAINNET_HIVE)) revert BadConfig();
        soul = IMiningSoul(soul_);
        journal = ILifeJournal(journal_);
        if (journal.soul() != soul_) revert WrongJournal();
        ifs = IERC20(ifs_);
        hive = hive_;
        operator = msg.sender;
        maxFeePerSegment = 1e21;
        minBond = 1 ether;
        bondMultiple = 5;
        challengeWindow = 1 days;
        challengeBond = 1e17;
        if (block.chainid == 56) {
            maxUserDaily = 100 ether;
            maxProtocolDaily = 1000 ether;
        }
        emit OperatorChanged(msg.sender);
    }

    function setOperator(address next) external {
        if (msg.sender != operator) revert Unauthorized();
        operator = next;
        emit OperatorChanged(next);
    }

    function setArbiter(address next) external {
        if (msg.sender != operator) revert Unauthorized();
        arbiter = next;
        emit ArbiterChanged(next);
    }

    function setAllowlisted(address who, bool ok) external {
        if (msg.sender != operator) revert Unauthorized();
        allowlisted[who] = ok;
        emit Allowlisted(who, ok);
    }

    function setPaused(bool next) external {
        if (msg.sender != operator) revert Unauthorized();
        paused = next;
        emit Paused(next);
    }

    function setLimits(uint256 maxFee, uint256 minBond_, uint256 multiple, uint256 window, uint256 challengeBond_) external {
        if (msg.sender != operator) revert Unauthorized();
        if (maxFee == 0 || minBond_ == 0 || multiple == 0 || multiple > MAX_BOND_MULTIPLE || window < 1 hours || window > 30 days || challengeBond_ == 0) revert LimitCap();
        maxFeePerSegment = maxFee;
        minBond = minBond_;
        bondMultiple = multiple;
        challengeWindow = window;
        challengeBond = challengeBond_;
        emit LimitsChanged(maxFee, minBond_, multiple, window, challengeBond_);
    }

    function setSpendLimits(uint256 userDaily, uint256 protocolDaily) external {
        if (msg.sender != operator) revert Unauthorized();
        if (block.chainid == 56 && (userDaily == 0 || protocolDaily == 0 || userDaily > protocolDaily)) revert LimitCap();
        maxUserDaily = userDaily;
        maxProtocolDaily = protocolDaily;
        emit SpendLimitsChanged(userDaily, protocolDaily);
    }

    function registerOperator(uint8 roles, uint256 amount) external nonReentrant {
        if (paused) revert PausedHub();
        if (!allowlisted[msg.sender]) revert NotAllowlisted();
        if (roles & (ROLE_RUNNER | ROLE_KEEPER) == 0) revert BadConfig();
        Operator storage op = operators[msg.sender];
        if (op.status == OP_ACTIVE || op.status == OP_EXITING) revert AlreadyRegistered();
        uint256 received = _pull(msg.sender, amount);
        if (received < minBond) revert BondLow();
        op.roles = roles;
        op.status = OP_ACTIVE;
        op.bond = received;
        op.exposure = 0;
        op.unlockAt = 0;
        emit OperatorRegistered(msg.sender, roles, received);
        emit BondChanged(msg.sender, received, 0);
    }

    function topUpBond(uint256 amount) external nonReentrant {
        Operator storage op = operators[msg.sender];
        if (op.status != OP_ACTIVE) revert NotActive();
        op.bond += _pull(msg.sender, amount);
        emit BondChanged(msg.sender, op.bond, op.exposure);
    }

    function beginExit() external {
        Operator storage op = operators[msg.sender];
        if (op.status != OP_ACTIVE) revert NotActive();
        op.status = OP_EXITING;
        op.unlockAt = uint64(block.timestamp + EXIT_COOLDOWN);
        emit BondChanged(msg.sender, op.bond, op.exposure);
    }

    function withdrawBond() external nonReentrant {
        Operator storage op = operators[msg.sender];
        if (op.status != OP_EXITING) revert NotExiting();
        if (block.timestamp < op.unlockAt) revert Cooldown();
        if (op.exposure != 0) revert Exposed();
        uint256 amount = op.bond;
        op.bond = 0;
        op.status = OP_EXITED;
        _push(msg.sender, amount);
        emit BondChanged(msg.sender, 0, 0);
    }

    function refuel(uint256 tokenId, uint256 amount) external nonReentrant {
        if (paused) revert PausedHub();
        _syncOwner(tokenId);
        if (soul.ownerOf(tokenId) != msg.sender) revert NotOwner();
        Tank storage tank = tanks[tokenId];
        uint256 received = _pull(msg.sender, amount);
        tank.ownerFuel += received;
        emit TankFueled(tokenId, tank.lifeId, 0, received, tank.ownerFuel, tank.giftFuel);
    }

    function giftFuel(uint256 tokenId, uint256 amount) external nonReentrant {
        if (paused) revert PausedHub();
        _syncOwner(tokenId);
        Tank storage tank = tanks[tokenId];
        uint256 received = _pull(msg.sender, amount);
        tank.giftFuel += received;
        emit TankFueled(tokenId, tank.lifeId, 1, received, tank.ownerFuel, tank.giftFuel);
    }

    function drainOwnerFuel(uint256 tokenId, uint256 amount) external nonReentrant {
        _syncOwner(tokenId);
        Tank storage tank = tanks[tokenId];
        if (soul.ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (amount == 0 || amount > tank.ownerFuel) revert Insufficient();
        tank.ownerFuel -= amount;
        _push(msg.sender, amount);
        emit TankFueled(tokenId, tank.lifeId, 0, 0, tank.ownerFuel, tank.giftFuel);
    }

    function claimRefund() external nonReentrant {
        uint256 amount = refunds[msg.sender];
        if (amount == 0) revert Insufficient();
        refunds[msg.sender] = 0;
        _push(msg.sender, amount);
    }

    function bindRunner(uint256 tokenId, address runner, uint256 fee, uint16 steps, uint256 spendCap, uint64 validUntil) external {
        if (paused) revert PausedHub();
        _syncOwner(tokenId);
        if (soul.ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (fee == 0 || fee > maxFeePerSegment) revert FeeCap();
        if (steps == 0 || steps > MAX_STEPS) revert WrongSteps();
        if (spendCap < fee) revert CapExceeded();
        if (validUntil != 0 && validUntil <= block.timestamp) revert OrderExpired();
        Operator storage op = operators[runner];
        if (op.status != OP_ACTIVE || op.roles & ROLE_RUNNER == 0) revert NotActive();
        if (!allowlisted[runner]) revert NotAllowlisted();
        Tank storage tank = tanks[tokenId];
        tank.runner = runner;
        tank.fee = fee;
        tank.steps = steps;
        tank.spendCap = spendCap;
        tank.spent = 0;
        tank.validUntil = validUntil;
        emit RunnerBound(tokenId, runner, fee, steps, spendCap, validUntil);
    }

    function openSegment(bytes32 id, uint256 tokenId, uint16 steps, bytes32 startRoot) external nonReentrant {
        if (paused) revert PausedHub();
        if (id == 0 || startRoot == 0) revert BadConfig();
        if (segments[id].status != 0) revert DupSegment();
        _syncOwner(tokenId);
        Tank storage tank = tanks[tokenId];
        if (tank.runner != msg.sender) revert Unbound();
        if (!allowlisted[msg.sender]) revert NotAllowlisted();
        if (steps != tank.steps) revert WrongSteps();
        Operator storage op = operators[msg.sender];
        if (op.status != OP_ACTIVE || op.roles & ROLE_RUNNER == 0) revert NotActive();
        uint256 fee = tank.fee;
        if (tank.ownerFuel + tank.giftFuel < fee) revert TankEmpty();
        if (tank.spent + fee > tank.spendCap) revert CapExceeded();
        if (tank.validUntil != 0 && block.timestamp > tank.validUntil) revert OrderExpired();
        if (activeLease[tokenId] != bytes32(0)) revert LeaseHeld();
        bytes32 head = lastFinalRoot[tokenId];
        if (head != bytes32(0) && startRoot != head) revert NeedContinuity();
        if (revokedHead[startRoot]) revert RevokedLine();
        ( , uint64 inputCount, uint64 consumed, bytes32 inputRoot, ) = journal.heads(tokenId);
        bytes32 workKey = keccak256(abi.encode(tokenId, startRoot, steps, consumed, inputCount, inputRoot));
        if (workClaimed[workKey]) revert WorkTaken();
        uint256 exposure = fee * bondMultiple;
        if (op.bond < op.exposure + exposure) revert BondLow();
        _consumeDaily(tank.owner, fee);
        uint256 fromOwner = fee <= tank.ownerFuel ? fee : tank.ownerFuel;
        uint256 fromGift = fee - fromOwner;
        tank.ownerFuel -= fromOwner;
        tank.giftFuel -= fromGift;
        tank.reserved += fee;
        tank.spent += fee;
        op.exposure += exposure;
        workClaimed[workKey] = true;
        activeLease[tokenId] = id;
        Segment storage seg = segments[id];
        seg.tokenId = tokenId;
        seg.lifeId = tank.lifeId;
        seg.runner = msg.sender;
        seg.steps = steps;
        seg.status = SEG_OPEN;
        seg.fee = fee;
        seg.fromOwner = fromOwner;
        seg.fromGift = fromGift;
        seg.exposure = exposure;
        seg.startRoot = startRoot;
        seg.funder = tank.owner;
        seg.inputFrom = consumed;
        seg.inputTo = inputCount;
        seg.inputRoot = inputRoot;
        seg.workKey = workKey;
        emit SegmentOpened(id, tokenId, msg.sender, fee, steps, startRoot);
        emit BondChanged(msg.sender, op.bond, op.exposure);
    }

    function commitPrivate(bytes32 id, Commitment calldata c, uint256 epoch, bytes32 previous, string calldata uri) external {
        Segment storage seg = segments[id];
        if (seg.status != SEG_OPEN) revert BadStatus();
        if (seg.runner != msg.sender) revert Unauthorized();
        if (c.steps != seg.steps) revert BadArchive();
        if (c.leafEvery == 0 || c.steps % c.leafEvery != 0 || c.checkpointEvery % c.leafEvery != 0) revert BadArchive();
        if (c.finalRoot == 0 || c.trajectoryRoot == 0) revert BadArchive();
        uint256 tokenId = seg.tokenId;
        if (soul.controlEpoch(tokenId) != epoch) revert StaleEpoch();
        if (!soul.canControl(tokenId, msg.sender)) revert Unauthorized();
        bytes32 archiveHash = archiveHashOf(tokenId, id, c);
        (uint64 sequence, uint64 inputCount, uint64 consumed, bytes32 inputRoot, bytes32 checkpointRoot) = journal.heads(tokenId);
        if (consumed != inputCount || inputCount != seg.inputTo || inputRoot != seg.inputRoot) revert BadArchive();
        bytes32 expected = keccak256(abi.encode(
            "ifs.checkpoint/1",
            block.chainid,
            address(journal),
            tokenId,
            epoch,
            sequence,
            previous,
            uint256(inputCount),
            inputRoot,
            soul.modelHash(),
            c.finalRoot,
            archiveHash,
            keccak256(bytes(uri))
        ));
        if (expected != checkpointRoot) revert BadArchive();
        seg.status = SEG_COMMITTED;
        seg.finalRoot = c.finalRoot;
        seg.trajectoryRoot = c.trajectoryRoot;
        seg.archiveHash = archiveHash;
        seg.journalSequence = sequence;
        seg.commitBlock = uint64(block.number);
        seg.challengeUntil = uint64(block.timestamp + challengeWindow);
        emit SegmentCommitted(id, c.trajectoryRoot, c.finalRoot, archiveHash, block.number);
    }

    function archiveHashOf(uint256 tokenId, bytes32 segmentId, Commitment calldata c) public view returns (bytes32) {
        return keccak256(abi.encode(
            "ifs.segment-archive/1",
            block.chainid,
            address(this),
            tokenId,
            segmentId,
            c.steps,
            c.checkpointEvery,
            c.leafEvery,
            c.startRoot,
            c.finalRoot,
            c.trajectoryRoot,
            c.checkpointPack
        ));
    }

    function lockSeed(bytes32 id) external {
        Segment storage seg = segments[id];
        if (seg.status != SEG_COMMITTED) revert BadStatus();
        if (seg.seed != 0) revert DupSegment();
        uint256 source = uint256(seg.commitBlock) + 2;
        if (block.number <= source) revert TooEarly();
        bytes32 h = blockhash(source);
        if (h == 0) revert SeedExpired();
        seg.seed = keccak256(abi.encode("iff.probe/1", h, id));
        emit SeedLocked(id, seg.seed, source);
    }

    function recordOpening(bytes32 id, bytes32 openingHash) external {
        Segment storage seg = segments[id];
        if (seg.runner != msg.sender) revert Unauthorized();
        if (seg.seed == 0) revert NoSeed();
        if (openingHash == 0) revert BadConfig();
        if (seg.status != SEG_COMMITTED) revert BadStatus();
        seg.openingHash = openingHash;
        emit OpeningRecorded(id, openingHash);
    }

    function settlePrivate(bytes32 id) external nonReentrant {
        Segment storage seg = segments[id];
        if (seg.runner != msg.sender) revert Unauthorized();
        if (seg.status != SEG_COMMITTED) revert BadStatus();
        if (seg.seed == 0) revert NoSeed();
        if (seg.openingHash == 0) revert NoOpening();
        if (block.timestamp <= seg.challengeUntil) revert WindowOpen();
        if (seg.paid != 0) revert AlreadyPaid();
        tanks[seg.tokenId].reserved -= seg.fee;
        seg.paid = seg.fee;
        seg.status = SEG_SETTLED;
        lastFinalRoot[seg.tokenId] = seg.finalRoot;
        seg.prevSettled = lastSettledId[seg.tokenId];
        lastSettledId[seg.tokenId] = id;
        _endLease(id, seg, true);
        _releaseExposure(seg);
        earnings[seg.runner] += seg.fee;
        operators[seg.runner].accepted += 1;
        workOf[seg.tokenId].accepted += 1;
        emit SegmentSettled(id, seg.runner, seg.fee);
    }

    function closeChallenge(bytes32 id) external {
        Segment storage seg = segments[id];
        if (seg.status != SEG_COMMITTED && seg.status != SEG_SETTLED) revert BadStatus();
        if (block.timestamp <= seg.challengeUntil) revert WindowOpen();
        _releaseExposure(seg);
        if (seg.status == SEG_COMMITTED) {
            _endLease(id, seg, false);
            _refundReserved(seg);
            seg.status = SEG_VOID;
            emit SegmentVoided(id);
        }
    }

    function voidSegment(bytes32 id) external {
        Segment storage seg = segments[id];
        if (seg.status != SEG_OPEN) revert BadStatus();
        if (msg.sender != seg.runner && soul.ownerOf(seg.tokenId) != msg.sender) revert Unauthorized();
        _releaseExposure(seg);
        _endLease(id, seg, false);
        _refundReserved(seg);
        seg.status = SEG_VOID;
        emit SegmentVoided(id);
    }

    /// @notice COMMITTED but blockhash(commit+2) has left the 256-window: refund, no slash.
    function voidExpired(bytes32 id) external {
        Segment storage seg = segments[id];
        if (seg.status != SEG_COMMITTED) revert BadStatus();
        if (seg.seed != 0) revert BadStatus();
        uint256 source = uint256(seg.commitBlock) + 2;
        if (block.number <= source + 256 || blockhash(source) != 0) revert TooEarly();
        if (msg.sender != seg.runner && soul.ownerOf(seg.tokenId) != msg.sender) revert Unauthorized();
        _releaseExposure(seg);
        _endLease(id, seg, false);
        _refundReserved(seg);
        seg.status = SEG_VOID;
        emit SegmentVoided(id);
    }

    function openDispute(bytes32 id) external nonReentrant {
        Segment storage seg = segments[id];
        if (seg.status != SEG_COMMITTED) revert BadStatus();
        if (block.timestamp > seg.challengeUntil) revert WindowClosed();
        if (msg.sender == seg.runner) revert SelfDispute();
        Operator storage op = operators[msg.sender];
        if (op.status != OP_ACTIVE) revert NotActive();
        uint256 held = challengeBond;
        if (op.bond < op.exposure + held) revert BondLow();
        op.exposure += held;
        seg.status = SEG_CHALLENGED;
        seg.challenger = msg.sender;
        seg.disputeAt = uint64(block.timestamp);
        seg.snapBond = held;
        seg.snapWindow = uint64(challengeWindow);
        operators[seg.runner].disputed += 1;
        workOf[seg.tokenId].disputed += 1;
        emit DisputeOpened(id, msg.sender);
        emit BondChanged(msg.sender, op.bond, op.exposure);
    }

    function submitVerdict(bytes32 id, uint8 verdict, bytes32 recordHash) external {
        Segment storage seg = segments[id];
        if (seg.status != SEG_CHALLENGED) revert NoDispute();
        if (verdict > VERDICT_NEITHER || recordHash == 0) revert BadConfig();
        if (msg.sender == seg.runner) {
            seg.runnerVerdict = verdict;
            seg.runnerRecord = recordHash;
            seg.runnerSubmitted = true;
        } else if (msg.sender == seg.challenger) {
            seg.challengerVerdict = verdict;
            seg.challengerRecord = recordHash;
            seg.challengerSubmitted = true;
        } else revert Unauthorized();
        emit VerdictSubmitted(id, msg.sender, verdict, recordHash);
    }

    function confirmVerdict(bytes32 id) external nonReentrant {
        Segment storage seg = segments[id];
        if (seg.status != SEG_CHALLENGED) revert NoDispute();
        if (!seg.runnerSubmitted || !seg.challengerSubmitted) revert TooEarly();
        if (seg.runnerRecord != seg.challengerRecord || seg.runnerVerdict != seg.challengerVerdict) revert Mismatch();
        _applyVerdict(id, seg, seg.runnerVerdict);
    }

    function timeoutDispute(bytes32 id) external nonReentrant {
        Segment storage seg = segments[id];
        if (seg.status != SEG_CHALLENGED) revert NoDispute();
        if (block.timestamp < uint256(seg.disputeAt) + uint256(seg.snapWindow)) revert TooEarly();
        if (seg.runnerSubmitted && seg.challengerSubmitted) {
            if (seg.runnerRecord != seg.challengerRecord || seg.runnerVerdict != seg.challengerVerdict) {
                _applyVerdict(id, seg, VERDICT_NEITHER);
                return;
            }
            _applyVerdict(id, seg, seg.runnerVerdict);
            return;
        }
        if (!seg.runnerSubmitted) _applyVerdict(id, seg, VERDICT_CHALLENGER);
        else _applyVerdict(id, seg, VERDICT_RUNNER);
    }

    function resolveByArbiter(bytes32 id, uint8 verdict) external nonReentrant {
        if (msg.sender != arbiter || arbiter == address(0)) revert Unauthorized();
        Segment storage seg = segments[id];
        if (seg.status != SEG_CHALLENGED) revert NoDispute();
        if (block.timestamp < uint256(seg.disputeAt) + uint256(seg.snapWindow)) revert TooEarly();
        if (verdict > VERDICT_NEITHER) revert BadConfig();
        _applyVerdict(id, seg, verdict);
    }

    function withdrawEarnings() external nonReentrant {
        uint256 amount = earnings[msg.sender];
        if (amount == 0) revert Insufficient();
        earnings[msg.sender] = 0;
        _push(msg.sender, amount);
    }

    function syncOwner(uint256 tokenId) external {
        _syncOwner(tokenId);
    }

    function previewSeed(bytes32 id) external view returns (bytes32) {
        Segment storage seg = segments[id];
        if (seg.seed != 0) return seg.seed;
        if (seg.commitBlock == 0) return 0;
        uint256 source = uint256(seg.commitBlock) + 2;
        bytes32 h = blockhash(source);
        if (h == 0) return 0;
        return keccak256(abi.encode("iff.probe/1", h, id));
    }

    /// @notice Satellite correction only. Does not rewrite Soul / Journal history.
    ///         Rolls the payable head back to this segment's parent and marks
    ///         later accepted descendants on the same life as revoked.
    function revokeAcceptance(bytes32 id) external {
        if (msg.sender != operator && (arbiter == address(0) || msg.sender != arbiter)) revert Unauthorized();
        Segment storage seg = segments[id];
        if (seg.status != SEG_SETTLED) revert BadStatus();
        if (revoked[id]) revert DupSegment();
        bytes32 cur = lastSettledId[seg.tokenId];
        uint256 guard;
        while (cur != 0 && cur != id) {
            Segment storage later = segments[cur];
            revoked[cur] = true;
            revokedHead[later.finalRoot] = true;
            if (later.workKey != bytes32(0)) workClaimed[later.workKey] = false;
            emit AcceptanceRevoked(cur, later.tokenId, later.startRoot);
            cur = later.prevSettled;
            if (++guard > 256) revert LimitCap();
        }
        if (cur != id) revert BadStatus();
        revoked[id] = true;
        revokedHead[seg.finalRoot] = true;
        if (seg.workKey != bytes32(0)) workClaimed[seg.workKey] = false;
        lastFinalRoot[seg.tokenId] = seg.startRoot;
        lastSettledId[seg.tokenId] = seg.prevSettled;
        emit AcceptanceRevoked(id, seg.tokenId, seg.startRoot);
    }

    function _consumeDaily(address who, uint256 amount) private {
        uint32 day = uint32(block.timestamp / 1 days);
        if (maxProtocolDaily != 0) {
            if (spendDay != day) {
                spendDay = day;
                daySpend = 0;
            }
            if (daySpend + amount > maxProtocolDaily) revert DayCap();
            daySpend += amount;
        }
        if (maxUserDaily != 0) {
            if (userSpendDay[who] != day) {
                userSpendDay[who] = day;
                userDaySpend[who] = 0;
            }
            if (userDaySpend[who] + amount > maxUserDaily) revert DayCap();
            userDaySpend[who] += amount;
        }
    }

    function _releaseDaily(address who, uint256 amount) private {
        uint32 day = uint32(block.timestamp / 1 days);
        if (maxProtocolDaily != 0 && spendDay == day && daySpend >= amount) daySpend -= amount;
        if (maxUserDaily != 0 && userSpendDay[who] == day && userDaySpend[who] >= amount) {
            userDaySpend[who] -= amount;
        }
    }

    function _applyVerdict(bytes32 id, Segment storage seg, uint8 verdict) private {
        address runner = seg.runner;
        address challenger = seg.challenger;
        uint256 held = seg.snapBond == 0 ? challengeBond : seg.snapBond;
        _releaseChallengerExposure(challenger, held);
        if (verdict == VERDICT_RUNNER) {
            _slash(challenger, held, id);
            operators[challenger].lost += 1;
            seg.status = SEG_COMMITTED;
            return;
        }
        uint256 slashAmt = seg.exposure;
        _releaseExposure(seg);
        _endLease(id, seg, false);
        _slash(runner, slashAmt, id);
        if (verdict == VERDICT_NEITHER) {
            _slash(challenger, held, id);
            operators[challenger].lost += 1;
        }
        if (seg.paid != 0) {
            uint256 heldEarn = earnings[runner];
            uint256 claw = heldEarn < seg.paid ? heldEarn : seg.paid;
            earnings[runner] = heldEarn - claw;
            _restoreFuel(seg, claw);
            seg.paid -= claw;
        } else {
            _refundReserved(seg);
        }
        seg.status = SEG_SLASHED;
        workOf[seg.tokenId].slashed += 1;
        operators[runner].lost += 1;
    }

    function _slash(address who, uint256 amount, bytes32 id) private {
        Operator storage op = operators[who];
        uint256 take = amount > op.bond ? op.bond : amount;
        op.bond -= take;
        _push(hive, take);
        emit SegmentSlashed(id, who, take, hive);
        emit BondChanged(who, op.bond, op.exposure);
    }

    function _releaseExposure(Segment storage seg) private {
        if (seg.exposure == 0) return;
        Operator storage op = operators[seg.runner];
        if (op.exposure >= seg.exposure) op.exposure -= seg.exposure;
        else op.exposure = 0;
        emit BondChanged(seg.runner, op.bond, op.exposure);
        seg.exposure = 0;
    }

    function _releaseChallengerExposure(address challenger, uint256 amount) private {
        Operator storage op = operators[challenger];
        if (op.exposure >= amount) op.exposure -= amount;
        else op.exposure = 0;
        emit BondChanged(challenger, op.bond, op.exposure);
    }

    function _refundReserved(Segment storage seg) private {
        if (seg.fee == 0) return;
        Tank storage tank = tanks[seg.tokenId];
        tank.reserved -= seg.fee;
        if (tank.spent >= seg.fee) tank.spent -= seg.fee;
        _releaseDaily(seg.funder, seg.fee);
        if (seg.fromOwner != 0) refunds[seg.funder] += seg.fromOwner;
        tank.giftFuel += seg.fromGift;
        if (seg.fromOwner != 0) emit OwnerRefunded(seg.tokenId, seg.funder, seg.fromOwner);
        seg.fromOwner = 0;
        seg.fromGift = 0;
        seg.fee = 0;
    }

    function _restoreFuel(Segment storage seg, uint256 claw) private {
        uint256 toOwner = claw <= seg.fromOwner ? claw : seg.fromOwner;
        uint256 toGift = claw - toOwner;
        Tank storage tank = tanks[seg.tokenId];
        if (toOwner != 0) refunds[seg.funder] += toOwner;
        tank.giftFuel += toGift;
        seg.fromOwner -= toOwner;
        seg.fromGift -= toGift;
    }

    function _endLease(bytes32 id, Segment storage seg, bool keepClaim) private {
        if (activeLease[seg.tokenId] == id) activeLease[seg.tokenId] = bytes32(0);
        if (!keepClaim && seg.workKey != bytes32(0)) workClaimed[seg.workKey] = false;
    }

    function _syncOwner(uint256 tokenId) private {
        address current = soul.ownerOf(tokenId);
        bytes32 life = soul.lifeId(tokenId);
        Tank storage tank = tanks[tokenId];
        if (tank.owner == address(0)) {
            tank.owner = current;
            tank.lifeId = life;
            return;
        }
        if (tank.lifeId != life) revert WrongLife();
        if (tank.owner == current) return;
        address old = tank.owner;
        uint256 refund = tank.ownerFuel;
        tank.ownerFuel = 0;
        tank.runner = address(0);
        tank.fee = 0;
        tank.steps = 0;
        tank.spendCap = 0;
        tank.spent = 0;
        tank.validUntil = 0;
        tank.owner = current;
        if (refund != 0) {
            refunds[old] += refund;
            emit OwnerRefunded(tokenId, old, refund);
        }
    }

    function _pull(address from, uint256 amount) private returns (uint256 received) {
        if (amount == 0) revert ZeroIn();
        uint256 before = ifs.balanceOf(address(this));
        if (!ifs.transferFrom(from, address(this), amount)) revert ZeroIn();
        received = ifs.balanceOf(address(this)) - before;
        if (received == 0) revert ZeroIn();
        if (received != amount) emit TaxObserved(from, amount, received);
    }

    function _push(address to, uint256 amount) private {
        if (amount == 0) return;
        uint256 before = ifs.balanceOf(to);
        if (!ifs.transfer(to, amount)) {
            refunds[to] += amount;
            return;
        }
        uint256 got = ifs.balanceOf(to) - before;
        if (got != amount) emit TaxObserved(to, amount, got);
    }

    receive() external payable { revert BadConfig(); }
    fallback() external payable { revert BadConfig(); }
}
