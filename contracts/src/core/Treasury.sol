// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITreasury} from "../interfaces/ITreasury.sol";
import {Errors} from "../utils/Errors.sol";

/// @title Treasury
/// @notice ERC20 escrow for market payouts (additive module).
contract Treasury is ITreasury {
    IERC20 public immutable token;
    mapping(address => bool) public approvedMarkets;
    mapping(address => uint256) public marketEscrow;

    event MarketApproved(address indexed market, bool approved);
    event Collected(address indexed market, address indexed from, uint256 amount);
    event Paid(address indexed market, address indexed to, uint256 amount);

    constructor(address tokenAddress) {
        if (tokenAddress == address(0)) revert Errors.InvalidAddress();
        token = IERC20(tokenAddress);
    }

    function setMarketApproved(address market, bool approved) external {
        approvedMarkets[market] = approved;
        emit MarketApproved(market, approved);
    }

    function collectBet(address market, address from, uint256 amount) external override {
        if (msg.sender != market) revert Errors.Unauthorized();
        if (!approvedMarkets[market]) revert Errors.Unauthorized();
        if (amount == 0) revert Errors.InvalidAmount();

        bool success = token.transferFrom(from, address(this), amount);
        if (!success) revert Errors.InvalidAmount();
        marketEscrow[market] += amount;
        emit Collected(market, from, amount);
    }

    function pay(address market, address to, uint256 amount) external override {
        if (msg.sender != market) revert Errors.Unauthorized();
        if (!approvedMarkets[market]) revert Errors.Unauthorized();
        if (marketEscrow[market] < amount) revert Errors.InvalidAmount();

        marketEscrow[market] -= amount;
        bool success = token.transfer(to, amount);
        if (!success) revert Errors.InvalidAmount();
        emit Paid(market, to, amount);
    }
}
