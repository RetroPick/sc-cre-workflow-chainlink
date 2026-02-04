// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface ISettlementRouter {
    function settleMarket(address market, uint256 marketId, uint8 outcomeIndex, uint16 confidence) external;
    function finalizeSession(bytes calldata payload) external;
}
