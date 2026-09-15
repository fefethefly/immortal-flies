// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title ImmortalFly: local/testnet MVP of a fully stored, deterministic digital life.
/// @notice Fly-inspired 16-node model, not a measured fruit-fly connectome.
///         No admin, upgrades, external URI, burn, arbitrary snapshot import or payable operation.
///         Prototype mint seeds are freely chosen; this is not a fair randomized distribution.
contract ImmortalFly is ERC721 {
    using Strings for uint256;

    string public constant MODEL = "iff-neural-16-v1";
    uint256 public constant MAX_SUPPLY = 1024;
    uint8 public constant MAX_STEPS = 128;
    uint256 public totalSupply;

    struct Brain {
        uint32 rng;
        uint64 ticks;
        uint16[3] learning;
        uint16[16] potential;
        uint16 energy;
        uint16 spikes;
        uint32 incarnation;
        bool dormant;
    }

    struct Fly {
        uint32 dna;
        uint64 bornAt;
        uint64 bornBlock;
        uint16 generation;
        uint256 parent1;
        uint256 parent2;
        Brain brain;
    }

    mapping(uint256 => Fly) private _flies;

    error SupplyExhausted();
    error InvalidSeed();
    error InvalidChannel();
    error InvalidSteps();
    error CannotTrain();
    error EnergyExhausted();
    error SoulCannotBeBurned();

    event Born(uint256 indexed tokenId, uint32 dna);
    event StateAdvanced(uint256 indexed tokenId, uint64 ticks, uint32 incarnation, uint16 energy, bool dormant);

    constructor() ERC721("IMMORTAL / Genesis Prototype", "IFF") {}

    modifier controller(uint256 tokenId) {
        _checkAuthorized(_requireOwned(tokenId), msg.sender, tokenId);
        _;
    }

    /// @notice Free prototype issuance; the sender pays only network gas.
    function mint(uint32 seed) external returns (uint256 tokenId) {
        if (totalSupply == MAX_SUPPLY) revert SupplyExhausted();
        if (seed == 0) revert InvalidSeed();
        tokenId = ++totalSupply;
        Fly storage fly = _flies[tokenId];
        fly.dna = seed;
        fly.bornAt = uint64(block.timestamp);
        fly.bornBlock = uint64(block.number);
        fly.brain.rng = seed;
        fly.brain.learning = [uint16(360), uint16(280), uint16(320)];
        fly.brain.energy = 1000;
        fly.brain.incarnation = 1;
        // All state exists before the ERC721 receiver callback.
        _safeMint(msg.sender, tokenId);
        emit Born(tokenId, seed);
    }

    /// @notice Entire current state is available without a project API or permission.
    function getFly(uint256 tokenId) external view returns (Fly memory) {
        _requireOwned(tokenId);
        return _flies[tokenId];
    }

    /// @notice Advance a bounded sequence of deterministic ticks; stimulus 3 is neutral.
    function tick(uint256 tokenId, uint8 stimulus, uint8 steps) external controller(tokenId) {
        if (stimulus > 3) revert InvalidChannel();
        if (steps == 0 || steps > MAX_STEPS) revert InvalidSteps();
        Fly storage fly = _flies[tokenId];
        Brain memory brain = fly.brain;
        for (uint256 i; i < steps; ++i) _tick(brain, fly.dna, stimulus);
        fly.brain = brain;
        _announce(tokenId, brain);
    }

    function train(uint256 tokenId, uint8 channel) external controller(tokenId) {
        if (channel > 2) revert InvalidChannel();
        Fly storage fly = _flies[tokenId];
        Brain memory brain = fly.brain;
        if (brain.dormant || brain.energy < 32) revert CannotTrain();
        uint16 learning = brain.learning[channel] + 40;
        brain.learning[channel] = learning > 1000 ? 1000 : learning;
        for (uint256 i; i < 32; ++i) _tick(brain, fly.dna, channel);
        fly.brain = brain;
        _announce(tokenId, brain);
    }

    function sleep(uint256 tokenId) external controller(tokenId) {
        _flies[tokenId].brain.dormant = true;
        _announce(tokenId, _flies[tokenId].brain);
    }

    function wake(uint256 tokenId) external controller(tokenId) {
        Brain storage brain = _flies[tokenId].brain;
        if (brain.energy == 0) revert EnergyExhausted();
        brain.dormant = false;
        _announce(tokenId, brain);
    }

    /// @notice Preserves identity, RNG, all potentials, learning, spikes and simulation age.
    ///         Rebirth counts have no power bonus and cannot create NFT supply.
    function rebirth(uint256 tokenId) external controller(tokenId) {
        Brain storage brain = _flies[tokenId].brain;
        brain.energy = 1000;
        brain.dormant = false;
        ++brain.incarnation;
        _announce(tokenId, brain);
    }

    function _tick(Brain memory brain, uint32 dna, uint8 stimulus) internal pure {
        if (brain.dormant || brain.energy == 0) return;
        uint16 oldSpikes = brain.spikes;
        brain.spikes = 0;
        for (uint256 i; i < 16; ++i) {
            brain.rng = _random32(brain.rng);
            uint256 input = brain.rng % 23
                + (i % 3 == stimulus ? 40 : 0)
                + brain.learning[i % 3] / 25
                + ((uint256(oldSpikes) >> ((i + 15) % 16)) & 1) * 12;
            uint256 voltage = uint256(brain.potential[i]) * 7 / 8 + input;
            uint256 threshold = 150 + ((uint256(dna) >> i) & 1) * 20;
            if (voltage >= threshold) {
                voltage -= threshold;
                brain.spikes |= uint16(1 << i);
            }
            brain.potential[i] = uint16(voltage);
        }
        ++brain.ticks;
        --brain.energy;
        if (brain.energy == 0) brain.dormant = true;
    }

    function _random32(uint32 value) internal pure returns (uint32) {
        value ^= value << 13;
        value ^= value >> 17;
        value ^= value << 5;
        return value;
    }

    function _announce(uint256 tokenId, Brain memory brain) internal {
        emit StateAdvanced(tokenId, brain.ticks, brain.incarnation, brain.energy, brain.dormant);
    }

    /// @dev Block any future internal burn path as well as rejecting zero-address transfers.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (to == address(0)) revert SoulCannotBeBurned();
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Fly storage fly = _flies[tokenId];
        string memory status = fly.brain.dormant ? "DORMANT" : "AWAKE";
        string memory svg = _svg(tokenId, fly, status);
        return string.concat("data:application/json;base64,", Base64.encode(bytes(string.concat(
            '{"name":"IMMORTAL #', tokenId.toString(),
            '","description":"Immutable 16-node fly-inspired prototype. Full state and basic art stored on chain. No scientific consciousness claim.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '","attributes":[{"trait_type":"Model","value":"', MODEL,
            '"},{"trait_type":"Generation","value":0},{"trait_type":"State","value":"', status,
            '"},{"trait_type":"Incarnation","value":', uint256(fly.brain.incarnation).toString(),
            '},{"trait_type":"Simulation ticks","value":', uint256(fly.brain.ticks).toString(),
            '},{"trait_type":"Energy","value":', uint256(fly.brain.energy).toString(),
            '},{"trait_type":"DNA","value":', uint256(fly.dna).toString(), '}]}'
        ))));
    }

    function _svg(uint256 tokenId, Fly storage fly, string memory status) private view returns (string memory) {
        string memory glow = fly.brain.dormant ? "#f4b444" : "#b6ff55";
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect width="600" height="800" fill="#080b0a"/><rect x="24" y="24" width="552" height="752" rx="12" stroke="#344036" fill="none"/><path d="M40 120H560M40 626H560" stroke="#344036"/><g fill="', glow,
            '" font-family="monospace"><text x="46" y="67" font-size="15">IMMORTAL / GENESIS</text><text x="46" y="103" font-size="24">SOUL #', tokenId.toString(),
            '</text><text x="440" y="67" font-size="13">', status,
            '</text></g><g stroke="', glow,
            '" fill="none" stroke-width="2"><ellipse cx="230" cy="330" rx="57" ry="144" transform="rotate(-35 230 330)"/><ellipse cx="370" cy="330" rx="57" ry="144" transform="rotate(35 370 330)"/><path d="M300 306L175 220M300 306L425 220M295 355L190 450L125 478M305 355L410 450L475 478M293 384L195 510L173 560M307 384L405 510L427 560M295 420L245 555L230 593M305 420L355 555L370 593"/></g><ellipse cx="300" cy="418" rx="38" ry="90" fill="#18211a" stroke="', glow,
            '"/><ellipse cx="300" cy="334" rx="39" ry="50" fill="#202d24" stroke="', glow,
            '"/><circle cx="276" cy="300" r="24" fill="#ee5656"/><circle cx="324" cy="300" r="24" fill="#ee5656"/><path d="M271 387H329M265 412H335M268 437H332M278 464H322" stroke="', glow,
            '"/><g font-family="monospace" fill="#bac7bd" font-size="16"><text x="46" y="664">LIFE ', uint256(fly.brain.incarnation).toString(),
            ' / ENERGY ', uint256(fly.brain.energy).toString(),
            '</text><text x="46" y="696">NEURAL TICKS ', uint256(fly.brain.ticks).toString(),
            '</text><text x="46" y="728">DNA ', uint256(fly.dna).toString(),
            '</text><text x="46" y="758" font-size="11">IFF-NEURAL-16-V1 / ON-CHAIN PROTOTYPE</text></g></svg>'
        );
    }
}
