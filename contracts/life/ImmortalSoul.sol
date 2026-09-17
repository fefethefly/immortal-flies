// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SoulRenderer} from "./SoulRenderer.sol";

interface ILifeHook {
    function afterBorn(uint256 tokenId, address owner, bytes32 life, uint32 seed, uint256 parentA, uint256 parentB, uint32 generation) external;
}

/// @notice Identity kernel. lifeId, genome and Gen0 hatch rules never move.
/// @dev EXTENSIBILITY: after mainnet, do not redeploy this collection to add features.
///      Put new product rules in satellite modules keyed by lifeId/tokenId; curator
///      only setModule. See docs/LIFE-PROTOCOL.md §3. Cannot mint Gen0, burn, or
///      rewrite a genome. Future-block entropy is NOT VRF. Requests expire after 256 blocks.
contract ImmortalSoul is ERC721, ReentrancyGuard {
    uint256 public constant MAX_GEN0 = 1024;
    uint256 public constant MAX_SUPPLY = 65536;
    uint256 public constant MAX_PER_ADDRESS = 1;
    bytes32 public constant LIFE_DOMAIN = keccak256("ifs.life/1");
    bytes32 public constant BIRTH_DOMAIN = keccak256("ifs.fly-birth/1");
    bytes32 public constant DECODER_HASH = keccak256("phenotype-loci/2");
    bytes32 public constant MODULE_KIN = keccak256("ifs.module.kin/1");
    bytes32 public constant MODULE_JOURNAL = keccak256("ifs.module.journal/1");
    bytes32 public constant MODULE_HOOK = keccak256("ifs.module.hook/1");

    uint256 public immutable birthChainId;
    bytes32 public immutable genesisRoot;
    bytes32 public immutable speciesHash;
    bytes32 public immutable modelHash;
    string public genesisURI;
    uint256 public totalSupply;
    uint256 public gen0Supply;
    uint256 public pendingCount;
    uint256 public requestCount;
    address public curator;

    struct Request { address recipient; uint64 entropyBlock; }
    struct Genome { uint32 seed; uint64 bornAt; uint64 bornBlock; }
    struct Descent { uint256 parentA; uint256 parentB; uint32 generation; }

    mapping(uint256 => Request) public requests;
    mapping(uint256 => string) public pendingNames;
    mapping(address => uint256) public pendingRequest;
    mapping(address => bool) public hatched;
    mapping(uint256 => Genome) private genomes;
    mapping(uint256 => string) private names;
    mapping(uint256 => Descent) private descents;
    mapping(uint256 => uint256[]) private kids;
    mapping(uint256 => uint256) public controlEpoch;
    /// @dev Not named `runner`: ethers v6 Contract already owns that property.
    mapping(uint256 => address) public authorizedRunner;
    mapping(bytes32 => address) public modules;

    event HatchRequested(uint256 indexed requestId, address indexed recipient, uint256 entropyBlock, string givenName);
    event HatchExpired(uint256 indexed requestId, address indexed recipient);
    event Born(uint256 indexed tokenId, address indexed owner, bytes32 indexed life, uint32 seed, bytes32 birthHash);
    event Named(uint256 indexed tokenId, string givenName, address indexed by);
    event DescentRecorded(uint256 indexed tokenId, uint256 indexed parentA, uint256 indexed parentB, uint32 generation);
    event ControlChanged(uint256 indexed tokenId, uint256 epoch, address authorizedRunner);
    event ModuleSet(bytes32 indexed id, address indexed module);
    event CuratorChanged(address indexed curator);

    error InvalidGenesis(); error SoldOut(); error PendingHatch(); error HatchNotReady();
    error HatchUnavailable(); error HatchLimit(); error OwnerOnly(); error SoulCannotBeBurned();
    error InvalidName(); error InvalidDescent(); error ModuleOnly(); error CuratorOnly();

    constructor(bytes32 root, bytes32 species, bytes32 model, string memory uri) ERC721("Immortal Flyswarm Soul", "IFSOUL") {
        if (root == 0 || species == 0 || model == 0 || bytes(uri).length == 0 || bytes(uri).length > 512) revert InvalidGenesis();
        birthChainId = block.chainid;
        genesisRoot = root; speciesHash = species; modelHash = model; genesisURI = uri;
        curator = msg.sender;
        emit CuratorChanged(msg.sender);
    }

    function requestHatch(string calldata given) external nonReentrant returns (uint256 id) {
        _checkName(given);
        if (gen0Supply + pendingCount >= MAX_GEN0) revert SoldOut();
        if (hatched[msg.sender]) revert HatchLimit();
        if (pendingRequest[msg.sender] != 0) revert PendingHatch();
        id = ++requestCount;
        requests[id] = Request(msg.sender, uint64(block.number + 2));
        pendingNames[id] = given;
        pendingRequest[msg.sender] = id;
        ++pendingCount;
        emit HatchRequested(id, msg.sender, block.number + 2, given);
    }

    /// @notice Anyone may finish a request, but cannot change its recipient, name or seed.
    function hatch(uint256 id) external nonReentrant returns (uint256 tokenId) {
        Request memory req = requests[id];
        if (req.recipient == address(0)) revert HatchUnavailable();
        if (block.number <= req.entropyBlock) revert HatchNotReady();
        bytes32 entropy = blockhash(req.entropyBlock);
        if (entropy == 0) revert HatchUnavailable();
        if (hatched[req.recipient]) revert HatchLimit();
        string memory given = pendingNames[id];
        delete requests[id]; delete pendingNames[id]; delete pendingRequest[req.recipient]; --pendingCount;
        tokenId = ++totalSupply;
        ++gen0Supply;
        uint32 seed = uint32(uint256(keccak256(abi.encode(BIRTH_DOMAIN, birthChainId, address(this), genesisRoot, req.recipient, id, entropy))));
        if (seed == 0) seed = 1;
        genomes[tokenId] = Genome(seed, uint64(block.timestamp), uint64(block.number));
        descents[tokenId] = Descent(0, 0, 0);
        _safeMint(req.recipient, tokenId);
        hatched[req.recipient] = true;
        _writeName(tokenId, given, req.recipient);
        emit Born(tokenId, req.recipient, lifeId(tokenId), seed, genomeHash(tokenId));
        emit DescentRecorded(tokenId, 0, 0, 0);
        _notifyBorn(tokenId, req.recipient, 0, 0, 0);
    }

    function expireHatch(uint256 id) external {
        Request memory req = requests[id];
        if (req.recipient == address(0) || block.number <= uint256(req.entropyBlock) + 256) revert HatchUnavailable();
        delete requests[id]; delete pendingNames[id]; delete pendingRequest[req.recipient]; --pendingCount;
        emit HatchExpired(id, req.recipient);
    }

    /// @notice Only the KIN module may mint later generations. Gen0 hatch rules stay frozen.
    function mintDescendant(address to, uint32 seed, uint256 parentA, uint256 parentB) external nonReentrant returns (uint256 tokenId) {
        if (modules[MODULE_KIN] != msg.sender) revert ModuleOnly();
        if (to == address(0) || seed == 0 || parentA == 0 || parentB == 0 || parentA == parentB) revert InvalidDescent();
        if (totalSupply >= MAX_SUPPLY) revert SoldOut();
        _requireOwned(parentA);
        _requireOwned(parentB);
        tokenId = ++totalSupply;
        uint32 generation = descents[parentA].generation;
        if (descents[parentB].generation > generation) generation = descents[parentB].generation;
        unchecked { ++generation; }
        genomes[tokenId] = Genome(seed, uint64(block.timestamp), uint64(block.number));
        descents[tokenId] = Descent(parentA, parentB, generation);
        kids[parentA].push(tokenId);
        kids[parentB].push(tokenId);
        _safeMint(to, tokenId);
        emit Born(tokenId, to, lifeId(tokenId), seed, genomeHash(tokenId));
        emit DescentRecorded(tokenId, parentA, parentB, generation);
        _notifyBorn(tokenId, to, parentA, parentB, generation);
    }

    function setGivenName(uint256 id, string calldata given) external {
        if (ownerOf(id) != msg.sender) revert OwnerOnly();
        _writeName(id, given, msg.sender);
    }

    function givenName(uint256 id) external view returns (string memory) {
        _requireOwned(id);
        return names[id];
    }

    function getDescent(uint256 id) external view returns (Descent memory) {
        _requireOwned(id);
        return descents[id];
    }

    function childrenOf(uint256 id) external view returns (uint256[] memory) {
        _requireOwned(id);
        return kids[id];
    }

    function setModule(bytes32 id, address module) external {
        if (msg.sender != curator) revert CuratorOnly();
        if (id == 0) revert InvalidDescent();
        modules[id] = module;
        emit ModuleSet(id, module);
    }

    function setCurator(address next) external {
        if (msg.sender != curator) revert CuratorOnly();
        curator = next;
        emit CuratorChanged(next);
    }

    function lifeId(uint256 id) public view returns (bytes32) {
        _requireOwned(id);
        return keccak256(abi.encode(LIFE_DOMAIN, birthChainId, address(this), id));
    }

    function getGenome(uint256 id) external view returns (Genome memory) { _requireOwned(id); return genomes[id]; }
    function decodeGen0(uint32 seed) external pure returns (SoulRenderer.Phenotype memory) { return SoulRenderer.decode(seed); }
    function genomeHash(uint256 id) public view returns (bytes32) {
        return keccak256(abi.encode(BIRTH_DOMAIN, lifeId(id), genesisRoot, DECODER_HASH, genomes[id].seed));
    }

    /// @notice NFT marketplace approvals never grant this authority. Every change revokes old sessions.
    function setRunner(uint256 id, address nextRunner) external {
        if (ownerOf(id) != msg.sender) revert OwnerOnly();
        authorizedRunner[id] = nextRunner; ++controlEpoch[id];
        emit ControlChanged(id, controlEpoch[id], nextRunner);
    }

    function canControl(uint256 id, address actor) external view returns (bool) {
        return ownerOf(id) == actor || (actor != address(0) && authorizedRunner[id] == actor);
    }

    function _update(address to, uint256 id, address auth) internal override returns (address from) {
        if (to == address(0)) revert SoulCannotBeBurned();
        from = super._update(to, id, auth);
        delete authorizedRunner[id]; ++controlEpoch[id];
        emit ControlChanged(id, controlEpoch[id], address(0));
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return SoulRenderer.render(id, genomes[id].seed, lifeId(id), genesisRoot, genomeHash(id), descents[id].generation, names[id]);
    }

    function _writeName(uint256 id, string memory given, address by) private {
        _checkName(given);
        names[id] = given;
        emit Named(id, given, by);
    }

    function _checkName(string memory given) private pure {
        bytes memory raw = bytes(given);
        if (raw.length == 0 || raw.length > 64) revert InvalidName();
        for (uint256 i; i < raw.length; ++i) {
            uint8 c = uint8(raw[i]);
            if (c < 0x20 || c == 0x22 || c == 0x5c) revert InvalidName();
        }
    }

    function _notifyBorn(uint256 id, address owner, uint256 parentA, uint256 parentB, uint32 generation) private {
        address hook = modules[MODULE_HOOK];
        if (hook == address(0)) return;
        try ILifeHook(hook).afterBorn(id, owner, lifeId(id), genomes[id].seed, parentA, parentB, generation) {} catch {}
    }
}
