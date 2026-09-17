// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMarketNft {
    function approve(address spender, uint256 id) external;
}

interface ISoulMarket {
    function list(uint256 tokenId, uint256 price) external;
    function withdrawRefund() external;
}

contract MockMarketSeller {
    function approve(address nft, address spender, uint256 id) external {
        IMarketNft(nft).approve(spender, id);
    }

    function list(address market, uint256 tokenId, uint256 price) external {
        ISoulMarket(market).list(tokenId, price);
    }

    function withdraw(address market) external {
        ISoulMarket(market).withdrawRefund();
    }

    receive() external payable {
        revert("no-bnb");
    }

    fallback() external payable {
        revert("no-bnb");
    }
}
