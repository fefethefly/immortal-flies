// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface ILifeSoul {
    function ownerOf(uint256) external view returns(address);
    function canControl(uint256,address) external view returns(bool);
    function controlEpoch(uint256) external view returns(uint256);
    function modelHash() external view returns(bytes32);
}
/// @notice Ordered authorized claims; does NOT verify the neural computation.
/// @dev No funds, bridge, administrator, or arbitrary replacement of previous history.
contract LifeJournal {
    ILifeSoul public immutable soul;
    struct Head { uint64 sequence; uint64 inputCount; uint64 consumedInputs; bytes32 inputRoot; bytes32 checkpointRoot; }
    mapping(uint256 => Head) public heads;
    event Stimulus(uint256 indexed tokenId, uint256 indexed inputIndex, uint256 epoch, uint8 kind, uint16 intensity, bytes32 inputRoot);
    event Checkpoint(uint256 indexed tokenId, uint256 indexed sequence, uint256 epoch, bytes32 previousRoot, bytes32 stateRoot, bytes32 archiveHash, bytes32 inputRoot, uint256 throughInput, string archiveURI, bytes32 checkpointRoot);
    error Unauthorized(); error StaleEpoch(); error InvalidInput(); error InvalidCheckpoint();
    constructor(address collection) { if(collection.code.length == 0) revert InvalidInput(); soul = ILifeSoul(collection); }
    function authorize(uint256 id, uint256 epoch) private view {
        if (!soul.canControl(id, msg.sender)) revert Unauthorized();
        if (soul.controlEpoch(id) != epoch) revert StaleEpoch();
    }
    function submitStimulus(uint256 id, uint256 epoch, uint8 kind, uint16 intensity, uint256 expectedInput) external {
        authorize(id, epoch);
        Head storage h = heads[id];
        if (kind > 2 || intensity > 1000 || expectedInput != h.inputCount) revert InvalidInput();
        ++h.inputCount;
        h.inputRoot = keccak256(abi.encode("ifs.input/1", block.chainid, address(this), id, epoch, h.inputCount, h.inputRoot, kind, intensity));
        emit Stimulus(id, h.inputCount, epoch, kind, intensity, h.inputRoot);
    }
    function checkpoint(uint256 id, uint256 epoch, bytes32 previous, uint256 throughInput, bytes32 stateRoot, bytes32 archiveHash, string calldata uri) external {
        authorize(id, epoch);
        Head storage h = heads[id];
        if (previous != h.checkpointRoot || throughInput != h.inputCount || stateRoot == 0 || archiveHash == 0 || bytes(uri).length == 0 || bytes(uri).length > 512) revert InvalidCheckpoint();
        ++h.sequence; h.consumedInputs = h.inputCount;
        h.checkpointRoot = keccak256(abi.encode("ifs.checkpoint/1", block.chainid, address(this), id, epoch, h.sequence, previous, throughInput, h.inputRoot, soul.modelHash(), stateRoot, archiveHash, keccak256(bytes(uri))));
        emit Checkpoint(id, h.sequence, epoch, previous, stateRoot, archiveHash, h.inputRoot, throughInput, uri, h.checkpointRoot);
    }
}
