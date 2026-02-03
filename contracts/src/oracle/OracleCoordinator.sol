// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ISettlementRouter} from "../interfaces/ISettlementRouter.sol";
import {Errors} from "../utils/Errors.sol";

/// @title OracleCoordinator
/// @notice Dispatches validated oracle results to the settlement router.
contract OracleCoordinator {
    address public creReceiver;
    address public settlementRouter;
    address public reportValidator;

    event CREReceiverUpdated(address indexed previous, address indexed current);
    event SettlementRouterUpdated(address indexed previous, address indexed current);
    event ReportValidatorUpdated(address indexed previous, address indexed current);

    modifier onlyReceiver() {
        if (msg.sender != creReceiver) revert Errors.Unauthorized();
        _;
    }

    function setCREReceiver(address receiver) external {
        address previous = creReceiver;
        creReceiver = receiver;
        emit CREReceiverUpdated(previous, receiver);
    }

    function setSettlementRouter(address router) external {
        address previous = settlementRouter;
        settlementRouter = router;
        emit SettlementRouterUpdated(previous, router);
    }

    function setReportValidator(address validator) external {
        address previous = reportValidator;
        reportValidator = validator;
        emit ReportValidatorUpdated(previous, validator);
    }

    function submitResult(address market, uint256 marketId, uint8 outcomeIndex, uint16 confidence)
        external
        onlyReceiver
    {
        if (reportValidator != address(0)) {
            (bool ok, ) = reportValidator.call(abi.encodeWithSignature("validate(uint16)", confidence));
            if (!ok) revert Errors.InvalidConfidence();
        }
        ISettlementRouter(settlementRouter).settleMarket(market, marketId, outcomeIndex, confidence);
    }
}
