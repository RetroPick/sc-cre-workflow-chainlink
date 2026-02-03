// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ISettlementRouter} from "../interfaces/ISettlementRouter.sol";
import {Errors} from "../utils/Errors.sol";

interface IPredictionMarketReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title SettlementRouter
/// @notice Forwards validated outcomes to PredictionMarket via onReport.
contract SettlementRouter is ISettlementRouter {
    address public oracleCoordinator;
    address public sessionFinalizer;

    event OracleCoordinatorUpdated(address indexed previous, address indexed current);
    event SessionFinalizerUpdated(address indexed previous, address indexed current);
    event MarketSettled(address indexed market, uint256 marketId, uint8 outcomeIndex, uint16 confidence);

    modifier onlyOracleCoordinator() {
        _onlyOracleCoordinator();
        _;
    }

    modifier onlySessionFinalizer() {
        _onlySessionFinalizer();
        _;
    }

    function _onlyOracleCoordinator() internal view {
        if (msg.sender != oracleCoordinator) revert Errors.Unauthorized();
    }

    function _onlySessionFinalizer() internal view {
        if (msg.sender != sessionFinalizer) revert Errors.Unauthorized();
    }

    function setOracleCoordinator(address coordinator) external {
        address previous = oracleCoordinator;
        oracleCoordinator = coordinator;
        emit OracleCoordinatorUpdated(previous, coordinator);
    }

    function setSessionFinalizer(address finalizer) external {
        address previous = sessionFinalizer;
        sessionFinalizer = finalizer;
        emit SessionFinalizerUpdated(previous, finalizer);
    }

    function settleMarket(address market, uint256 marketId, uint8 outcomeIndex, uint16 confidence)
        external
        override
        onlyOracleCoordinator
    {
        bytes memory report = bytes.concat(bytes1(0x01), abi.encode(marketId, outcomeIndex, confidence));
        IPredictionMarketReceiver(market).onReport("", report);
        emit MarketSettled(market, marketId, outcomeIndex, confidence);
    }

    function finalizeSession(bytes calldata payload) external onlySessionFinalizer {
        emit MarketSettled(address(0), 0, 0, 0);
        payload;
    }
}
