// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ImmortalSoul} from "./ImmortalSoul.sol";

/// @notice Official ask book for one ImmortalSoul collection. See docs/SOUL-MARKET.md.
/// @dev Independent satellite. Not a Soul module. Do not setModule.
contract SoulMarket is ReentrancyGuard {
    uint256 public constant MIN_PRICE = 0.001 ether;
    uint16 public constant MAX_FEE_BPS = 1000;
    address public constant MAINNET_HIVE = 0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467;

    ImmortalSoul public immutable soul;
    address public immutable hive;
    address public operator;
    uint16 public feeBps;

    struct Listing {
        address seller;
        bytes32 lifeId;
        uint256 price;
        uint256 listedAt;
    }

    mapping(uint256 => Listing) public listings;
    mapping(address => uint256) public refunds;

    event Listed(uint256 indexed tokenId, address indexed seller, bytes32 lifeId, uint256 price);
    event Relisted(uint256 indexed tokenId, address indexed seller, bytes32 lifeId, uint256 price);
    event Canceled(uint256 indexed tokenId, address indexed seller, bytes32 lifeId);
    event Swept(uint256 indexed tokenId, address indexed seller, bytes32 lifeId);
    event Sold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        bytes32 lifeId,
        uint256 price,
        uint256 fee
    );
    event FeeBpsChanged(uint16 next);
    event OperatorChanged(address next);

    error Unauthorized();
    error NotListed();
    error WrongPrice();
    error BadList();
    error WrongLife();
    error FeeCap();

    constructor(address soul_, address hive_) {
        if (soul_ == address(0) || hive_ == address(0)) revert BadList();
        if (block.chainid == 56 && hive_ != MAINNET_HIVE) revert BadList();
        soul = ImmortalSoul(soul_);
        hive = hive_;
        operator = msg.sender;
        feeBps = 200;
    }

    function setOperator(address next) external {
        if (msg.sender != operator) revert Unauthorized();
        operator = next;
        emit OperatorChanged(next);
    }

    function setFeeBps(uint16 next) external {
        if (msg.sender != operator) revert Unauthorized();
        if (next > MAX_FEE_BPS) revert FeeCap();
        feeBps = next;
        emit FeeBpsChanged(next);
    }

    function list(uint256 tokenId, uint256 price) external {
        if (listings[tokenId].price != 0) revert BadList();
        _requireAsk(msg.sender, tokenId, price);
        bytes32 id = soul.lifeId(tokenId);
        listings[tokenId] = Listing({
            seller: msg.sender,
            lifeId: id,
            price: price,
            listedAt: block.timestamp
        });
        emit Listed(tokenId, msg.sender, id, price);
    }

    function relist(uint256 tokenId, uint256 price) external {
        Listing storage row = listings[tokenId];
        if (row.price == 0) revert NotListed();
        if (row.seller != msg.sender) revert Unauthorized();
        _requireAsk(msg.sender, tokenId, price);
        bytes32 id = soul.lifeId(tokenId);
        row.lifeId = id;
        row.price = price;
        row.listedAt = block.timestamp;
        emit Relisted(tokenId, msg.sender, id, price);
    }

    function cancel(uint256 tokenId) external {
        Listing memory row = listings[tokenId];
        if (row.price == 0) revert NotListed();
        if (row.seller != msg.sender) revert Unauthorized();
        delete listings[tokenId];
        emit Canceled(tokenId, row.seller, row.lifeId);
    }

    function sweep(uint256 tokenId) external {
        Listing memory row = listings[tokenId];
        if (row.price == 0) revert NotListed();
        if (_listingLive(row, tokenId)) revert BadList();
        delete listings[tokenId];
        emit Swept(tokenId, row.seller, row.lifeId);
    }

    function buy(uint256 tokenId) external payable nonReentrant {
        Listing memory row = listings[tokenId];
        if (row.price == 0) revert NotListed();
        if (msg.value != row.price) revert WrongPrice();
        if (msg.sender == row.seller) revert BadList();
        if (soul.ownerOf(tokenId) != row.seller) revert BadList();
        if (soul.lifeId(tokenId) != row.lifeId) revert WrongLife();
        if (!_isApproved(row.seller, tokenId)) revert Unauthorized();
        delete listings[tokenId];
        soul.transferFrom(row.seller, msg.sender, tokenId);
        uint256 fee = (row.price * feeBps) / 10_000;
        _pay(hive, fee);
        _pay(row.seller, row.price - fee);
        emit Sold(tokenId, row.seller, msg.sender, row.lifeId, row.price, fee);
    }

    function withdrawRefund() external nonReentrant {
        uint256 amount = refunds[msg.sender];
        if (amount == 0) revert NotListed();
        refunds[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) {
            refunds[msg.sender] = amount;
            revert Unauthorized();
        }
    }

    receive() external payable {
        revert BadList();
    }

    fallback() external payable {
        revert BadList();
    }

    function _requireAsk(address seller, uint256 tokenId, uint256 price) private view {
        if (price < MIN_PRICE) revert BadList();
        if (soul.ownerOf(tokenId) != seller) revert Unauthorized();
        if (!_isApproved(seller, tokenId)) revert Unauthorized();
    }

    function _listingLive(Listing memory row, uint256 tokenId) private view returns (bool) {
        if (soul.ownerOf(tokenId) != row.seller) return false;
        if (soul.lifeId(tokenId) != row.lifeId) return false;
        return _isApproved(row.seller, tokenId);
    }

    function _isApproved(address owner, uint256 tokenId) private view returns (bool) {
        return soul.getApproved(tokenId) == address(this) || soul.isApprovedForAll(owner, address(this));
    }

    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) refunds[to] += amount;
    }
}
