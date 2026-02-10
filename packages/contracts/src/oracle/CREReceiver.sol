// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReceiverTemplate} from "../interfaces/ReceiverTemplate.sol";
import {OracleCoordinator} from "./OracleCoordinator.sol";

/// @title CREReceiver
/// @notice CRE entrypoint that forwards settlement payloads.
contract CREReceiver is ReceiverTemplate {
    OracleCoordinator public oracleCoordinator;

    event OracleCoordinatorUpdated(address indexed previous, address indexed current);

    constructor(address forwarderAddress, address coordinator) ReceiverTemplate(forwarderAddress) {
        oracleCoordinator = OracleCoordinator(coordinator);
    }

    function setOracleCoordinator(address coordinator) external onlyOwner {
        address previous = address(oracleCoordinator);
        oracleCoordinator = OracleCoordinator(coordinator);
        emit OracleCoordinatorUpdated(previous, coordinator);
    }

    function _processReport(bytes calldata report) internal override {
        if (report.length > 0 && report[0] == 0x03) {
            oracleCoordinator.submitSession(report[1:]);
            return;
        }
        (address market, uint256 marketId, uint8 outcomeIndex, uint16 confidence) =
            abi.decode(report, (address, uint256, uint8, uint16));
        oracleCoordinator.submitResult(market, marketId, outcomeIndex, confidence);
    }
}
