// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IHatchGate} from "./IHatchGate.sol";
import {SoulRenderer} from "./SoulRenderer.sol";

interface ILifeHook {
    function afterBorn(uint256 tokenId, address owner, bytes32 life, uint32 seed, uint256 parentA, uint256 parentB, uint32 generation) external;
}

/// @notice Identity kernel. lifeId, genome and Gen0 hatch rules never move.
/// @dev EXTENSIBILITY: after mainnet, do not redeploy this collection to add features.
///      Play lives in modules keyed by lifeId. Renderer is replaceable after 48h challenge.
///      Cannot mint Gen0 as curator, burn, or rewrite a genome. Future-block entropy is NOT VRF.
contract ImmortalSoul is ERC721, ReentrancyGuard {
    uint256 public constant MAX_GEN0 = 1024;
    uint256 public constant MAX_PER_ADDRESS = 1;
    uint64 public constant TIMELOCK = 48 hours;
    uint16 public constant MAX_ROYALTY_BPS = 500;
    bytes32 public constant LIFE_DOMAIN = keccak256("ifs.life/1");
    bytes32 public constant BIRTH_DOMAIN = keccak256("ifs.fly-birth/1");
    bytes32 public constant DECODER_HASH = keccak256("phenotype-loci/3");
    bytes32 public constant MODULE_KIN = keccak256("ifs.module.kin/1");
    bytes32 public constant MODULE_JOURNAL = keccak256("ifs.module.journal/1");
    bytes32 public constant MODULE_HOOK = keccak256("ifs.module.hook/1");
    bytes32 public constant MODULE_HATCH_GATE = keccak256("ifs.module.hatch-gate/1");

    uint256 public immutable birthChainId;
    bytes32 public immutable genesisRoot;
    bytes32 public immutable speciesHash;
    bytes32 public immutable modelHash;
    string public genesisURI;
    uint256 public totalSupply;
    uint256 public maxSupply = 1_048_576;
    uint256 public gen0Supply;
    uint256 public pendingCount;
    uint256 public requestCount;
    address public curator;
    address public renderer;
    bool public rendererLocked;
    string public contractURI;
    address public royaltyReceiver;
    uint16 public royaltyBps;

    struct Request { address recipient; uint64 entropyBlock; }
    struct Genome { uint32 seed; uint64 bornAt; uint64 bornBlock; uint16 lookVersion; }
    struct Descent { uint256 parentA; uint256 parentB; uint32 generation; }
    struct Pending { address next; uint64 eta; }
    struct PendingRoyalty { address receiver; uint16 bps; uint64 eta; }

    mapping(uint256 => Request) public requests;
    mapping(uint256 => string) public pendingNames;
    mapping(address => uint256) public pendingRequest;
    mapping(address => bool) public hatched;
    mapping(uint256 => Genome) private genomes;
    mapping(uint256 => string) private names;
    mapping(uint256 => Descent) private descents;
    mapping(uint256 => uint256[]) private kids;
    mapping(uint256 => uint256) public controlEpoch;
    mapping(uint256 => address) public authorizedRunner;
    mapping(bytes32 => address) public modules;
    mapping(bytes32 => Pending) public pendingModule;
    Pending public pendingRenderer;
    Pending public pendingCurator;
    PendingRoyalty public pendingRoyalty;

    event HatchRequested(uint256 indexed requestId, address indexed recipient, uint256 entropyBlock, string givenName);
    event HatchExpired(uint256 indexed requestId, address indexed recipient);
    event Born(uint256 indexed tokenId, address indexed owner, bytes32 indexed life, uint32 seed, bytes32 birthHash);
    event Named(uint256 indexed tokenId, string givenName, address indexed by);
    event DescentRecorded(uint256 indexed tokenId, uint256 indexed parentA, uint256 indexed parentB, uint32 generation);
    event ControlChanged(uint256 indexed tokenId, uint256 epoch, address authorizedRunner);
    event ModuleProposed(bytes32 indexed id, address indexed next, uint64 eta);
    event ModuleSet(bytes32 indexed id, address indexed module);
    event CuratorProposed(address indexed next, uint64 eta);
    event CuratorChanged(address indexed curator);
    event RendererProposed(address indexed next, uint64 eta);
    event RendererSet(address indexed renderer);
    event RendererLocked();
    event RendererChallenged(uint32 seed);
    event MaxSupplyRaised(uint256 maxSupply);
    event RoyaltyProposed(address indexed receiver, uint16 bps, uint64 eta);
    event RoyaltySet(address indexed receiver, uint16 bps);
    event ContractURISet(string uri);
    event MetadataUpdate(uint256 tokenId);
    event BatchMetadataUpdate(uint256 fromTokenId, uint256 toTokenId);

    error InvalidGenesis(); error SoldOut(); error PendingHatch(); error HatchNotReady();
    error HatchUnavailable(); error HatchLimit(); error HatchDenied(); error OwnerOnly();
    error SoulCannotBeBurned(); error InvalidName(); error InvalidDescent(); error ModuleOnly();
    error CuratorOnly(); error Timelock(); error Locked(); error RendererMismatch();
    error SameLoci(); error RoyaltyCap(); error SupplyCap();

    constructor(bytes32 root, bytes32 species, bytes32 model, string memory uri, address renderer_)
        ERC721("Immortal Flyswarm Soul", "IFSOUL")
    {
        if (root == 0 || species == 0 || model == 0 || renderer_ == address(0)) revert InvalidGenesis();
        if (bytes(uri).length == 0 || bytes(uri).length > 512) revert InvalidGenesis();
        birthChainId = block.chainid;
        genesisRoot = root;
        speciesHash = species;
        modelHash = model;
        genesisURI = uri;
        renderer = renderer_;
        curator = msg.sender;
        emit CuratorChanged(msg.sender);
        emit RendererSet(renderer_);
    }

    function requestHatch(string calldata given) external nonReentrant returns (uint256 id) {
        return _requestHatch(given, bytes(""));
    }

    function requestHatch(string calldata given, bytes calldata proof) external nonReentrant returns (uint256 id) {
        return _requestHatch(given, proof);
    }

    function _requestHatch(string calldata given, bytes memory proof) private returns (uint256 id) {
        _checkName(given);
        if (gen0Supply + pendingCount >= MAX_GEN0) revert SoldOut();
        if (totalSupply >= maxSupply) revert SoldOut();
        if (hatched[msg.sender]) revert HatchLimit();
        if (pendingRequest[msg.sender] != 0) revert PendingHatch();
        address gate = modules[MODULE_HATCH_GATE];
        if (gate != address(0) && !IHatchGate(gate).allowHatch(msg.sender, given, proof)) revert HatchDenied();
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
        if (totalSupply >= maxSupply) revert SoldOut();
        string memory given = pendingNames[id];
        delete requests[id];
        delete pendingNames[id];
        delete pendingRequest[req.recipient];
        --pendingCount;
        tokenId = ++totalSupply;
        ++gen0Supply;
        uint32 seed = uint32(uint256(keccak256(abi.encode(BIRTH_DOMAIN, birthChainId, address(this), genesisRoot, req.recipient, id, entropy))));
        if (seed == 0) seed = 1;
        genomes[tokenId] = Genome(seed, uint64(block.timestamp), uint64(block.number), _lookVersion());
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
        delete requests[id];
        delete pendingNames[id];
        delete pendingRequest[req.recipient];
        --pendingCount;
        emit HatchExpired(id, req.recipient);
    }

    /// @notice Only the KIN module may mint later generations. Gen0 hatch rules stay frozen.
    function mintDescendant(address to, uint32 seed, uint256 parentA, uint256 parentB) external nonReentrant returns (uint256 tokenId) {
        if (modules[MODULE_KIN] != msg.sender) revert ModuleOnly();
        if (to == address(0) || seed == 0 || parentA == 0 || parentB == 0 || parentA == parentB) revert InvalidDescent();
        if (totalSupply >= maxSupply) revert SoldOut();
        _requireOwned(parentA);
        _requireOwned(parentB);
        tokenId = ++totalSupply;
        uint32 generation = descents[parentA].generation;
        if (descents[parentB].generation > generation) generation = descents[parentB].generation;
        unchecked { ++generation; }
        genomes[tokenId] = Genome(seed, uint64(block.timestamp), uint64(block.number), _lookVersion());
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
        emit MetadataUpdate(id);
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
        if (module == address(0) || totalSupply == 0) {
            modules[id] = module;
            delete pendingModule[id];
            emit ModuleSet(id, module);
            return;
        }
        uint64 eta = uint64(block.timestamp + TIMELOCK);
        pendingModule[id] = Pending(module, eta);
        emit ModuleProposed(id, module, eta);
    }

    function activateModule(bytes32 id) external {
        Pending memory p = pendingModule[id];
        if (p.next == address(0) || p.eta == 0) revert InvalidDescent();
        if (block.timestamp < p.eta) revert Timelock();
        modules[id] = p.next;
        delete pendingModule[id];
        emit ModuleSet(id, p.next);
    }

    function setCurator(address next) external {
        if (msg.sender != curator) revert CuratorOnly();
        if (next == address(0) || totalSupply == 0) {
            curator = next;
            delete pendingCurator;
            emit CuratorChanged(next);
            return;
        }
        uint64 eta = uint64(block.timestamp + TIMELOCK);
        pendingCurator = Pending(next, eta);
        emit CuratorProposed(next, eta);
    }

    function acceptCurator() external {
        Pending memory p = pendingCurator;
        if (p.next == address(0) || p.eta == 0) revert InvalidDescent();
        if (msg.sender != p.next) revert CuratorOnly();
        if (block.timestamp < p.eta) revert Timelock();
        curator = p.next;
        delete pendingCurator;
        emit CuratorChanged(p.next);
    }

    function proposeRenderer(address next) external {
        if (msg.sender != curator) revert CuratorOnly();
        if (rendererLocked) revert Locked();
        if (next == address(0)) revert InvalidDescent();
        if (totalSupply == 0) {
            renderer = next;
            delete pendingRenderer;
            emit RendererSet(next);
            return;
        }
        uint64 eta = uint64(block.timestamp + TIMELOCK);
        pendingRenderer = Pending(next, eta);
        emit RendererProposed(next, eta);
    }

    function challengeRenderer(uint32 seed) external {
        address next = pendingRenderer.next;
        if (next == address(0) || pendingRenderer.eta == 0) revert InvalidDescent();
        if (_lociPrefixOk(renderer, next, seed)) revert SameLoci();
        delete pendingRenderer;
        emit RendererChallenged(seed);
    }

    function activateRenderer() external {
        if (rendererLocked) revert Locked();
        Pending memory p = pendingRenderer;
        if (p.next == address(0) || p.eta == 0) revert InvalidDescent();
        if (block.timestamp < p.eta) revert Timelock();
        if (SoulRenderer(p.next).loci(1).length < SoulRenderer(renderer).loci(1).length) revert RendererMismatch();
        renderer = p.next;
        delete pendingRenderer;
        emit RendererSet(p.next);
        uint256 n = totalSupply;
        if (n > 0) emit BatchMetadataUpdate(1, n);
    }

    function lockRenderer() external {
        if (msg.sender != curator) revert CuratorOnly();
        rendererLocked = true;
        delete pendingRenderer;
        emit RendererLocked();
    }

    function raiseMaxSupply(uint256 next) external {
        if (msg.sender != curator) revert CuratorOnly();
        if (next <= maxSupply) revert SupplyCap();
        maxSupply = next;
        emit MaxSupplyRaised(next);
    }

    function setRoyalty(address receiver, uint16 bps) external {
        if (msg.sender != curator) revert CuratorOnly();
        if (bps > MAX_ROYALTY_BPS) revert RoyaltyCap();
        if (receiver == address(0) && bps != 0) revert InvalidDescent();
        if (totalSupply == 0) {
            royaltyReceiver = receiver;
            royaltyBps = bps;
            delete pendingRoyalty;
            emit RoyaltySet(receiver, bps);
            return;
        }
        uint64 eta = uint64(block.timestamp + TIMELOCK);
        pendingRoyalty = PendingRoyalty(receiver, bps, eta);
        emit RoyaltyProposed(receiver, bps, eta);
    }

    function activateRoyalty() external {
        PendingRoyalty memory p = pendingRoyalty;
        if (p.eta == 0) revert InvalidDescent();
        if (block.timestamp < p.eta) revert Timelock();
        royaltyReceiver = p.receiver;
        royaltyBps = p.bps;
        delete pendingRoyalty;
        emit RoyaltySet(p.receiver, p.bps);
    }

    function setContractURI(string calldata uri) external {
        if (msg.sender != curator) revert CuratorOnly();
        contractURI = uri;
        emit ContractURISet(uri);
    }

    function setGenesisURI(string calldata uri) external {
        if (msg.sender != curator) revert CuratorOnly();
        if (bytes(uri).length == 0 || bytes(uri).length > 512) revert InvalidGenesis();
        genesisURI = uri;
    }

    function lifeId(uint256 id) public view returns (bytes32) {
        _requireOwned(id);
        return keccak256(abi.encode(LIFE_DOMAIN, birthChainId, address(this), id));
    }

    function getGenome(uint256 id) external view returns (Genome memory) {
        _requireOwned(id);
        return genomes[id];
    }

    function decodeGen0(uint32 seed) external view returns (SoulRenderer.Phenotype memory) {
        return SoulRenderer(renderer).decode(seed);
    }

    function chipsOf(uint32 seed) external view returns (bytes32[3] memory words) {
        (bytes32 w0, bytes32 w1, bytes32 w2) = SoulRenderer(renderer).chipWords(seed);
        words[0] = w0;
        words[1] = w1;
        words[2] = w2;
    }

    function genomeHash(uint256 id) public view returns (bytes32) {
        return keccak256(abi.encode(BIRTH_DOMAIN, lifeId(id), genesisRoot, genomes[id].seed));
    }

    function royaltyInfo(uint256, uint256 salePrice) external view returns (address, uint256) {
        if (royaltyReceiver == address(0) || royaltyBps == 0) return (address(0), 0);
        return (royaltyReceiver, (salePrice * royaltyBps) / 10_000);
    }

    function setRunner(uint256 id, address nextRunner) external {
        if (ownerOf(id) != msg.sender) revert OwnerOnly();
        authorizedRunner[id] = nextRunner;
        ++controlEpoch[id];
        emit ControlChanged(id, controlEpoch[id], nextRunner);
    }

    function canControl(uint256 id, address actor) external view returns (bool) {
        return ownerOf(id) == actor || (actor != address(0) && authorizedRunner[id] == actor);
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0x2a55205a || interfaceId == 0x49064906 || super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 id, address auth) internal override returns (address from) {
        if (to == address(0)) revert SoulCannotBeBurned();
        from = super._update(to, id, auth);
        delete authorizedRunner[id];
        ++controlEpoch[id];
        emit ControlChanged(id, controlEpoch[id], address(0));
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        address r = renderer;
        try SoulRenderer(r).tokenURI(address(this), id) returns (string memory uri) {
            if (bytes(uri).length != 0) return uri;
        } catch {}
        Genome memory g = genomes[id];
        try SoulRenderer(r).render(id, g.seed, lifeId(id), genesisRoot, genomeHash(id), descents[id].generation, names[id]) returns (string memory uri) {
            return uri;
        } catch {}
        return string.concat(
            "data:application/json,{\"name\":\"#",
            Strings.toString(id),
            "\",\"seed\":",
            Strings.toString(g.seed),
            "}"
        );
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
        try ILifeHook(hook).afterBorn{gas: 200000}(id, owner, lifeId(id), genomes[id].seed, parentA, parentB, generation) {} catch {}
    }

    function _lookVersion() private view returns (uint16) {
        try SoulRenderer(renderer).version() returns (uint16 v) {
            return v;
        } catch {
            return 3;
        }
    }

    function _lociPrefixOk(address oldR, address newR, uint32 seed) private view returns (bool) {
        bytes memory a = SoulRenderer(oldR).loci(seed);
        bytes memory b = SoulRenderer(newR).loci(seed);
        uint256 n = a.length;
        if (b.length < n) return false;
        for (uint256 i; i < n; ++i) if (a[i] != b[i]) return false;
        return true;
    }
}
