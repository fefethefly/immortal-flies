// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IKinBuyAdapter} from "./IKinBuyAdapter.sol";

interface IFlapPortal {
    struct ExactInputParams {
        address inputToken;
        address outputToken;
        uint256 inputAmount;
        uint256 minOutputAmount;
        bytes permitData;
    }

    function swapExactInput(ExactInputParams calldata params) external payable returns (uint256 outputAmount);
}

/// @notice Buys IFS on Flap while the token is still Tradable. Do not point this at the empty Pancake pair.
contract FlapPortalBuyAdapter is IKinBuyAdapter {
    address public immutable portal;

    error BadBuy();

    constructor(address portal_) {
        if (portal_ == address(0)) revert BadBuy();
        portal = portal_;
    }

    function buyToSink(address ifs, address sink, uint256 minOut) external payable returns (uint256 amountOut) {
        if (msg.value == 0 || ifs == address(0) || sink == address(0) || sink == address(this)) revert BadBuy();
        uint256 before = _balance(ifs, address(this));
        IFlapPortal(portal).swapExactInput{value: msg.value}(
            IFlapPortal.ExactInputParams({
                inputToken: address(0),
                outputToken: ifs,
                inputAmount: msg.value,
                minOutputAmount: minOut,
                permitData: ""
            })
        );
        uint256 got = _balance(ifs, address(this)) - before;
        if (got == 0) revert BadBuy();
        uint256 sinkBefore = _balance(ifs, sink);
        _transfer(ifs, sink, got);
        amountOut = _balance(ifs, sink) - sinkBefore;
        if (amountOut == 0) revert BadBuy();
        uint256 leftover = address(this).balance;
        if (leftover != 0) {
            (bool ok, ) = sink.call{value: leftover}("");
            if (!ok) revert BadBuy();
        }
    }

    function _balance(address token, address account) private view returns (uint256 value) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", account));
        if (!ok || data.length < 32) revert BadBuy();
        value = abi.decode(data, (uint256));
    }

    function _transfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert BadBuy();
    }
}
