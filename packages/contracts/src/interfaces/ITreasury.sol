// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface ITreasury {
    function collectBet(address market, address from, uint256 amount) external;
    function pay(address market, address to, uint256 amount) external;
}
