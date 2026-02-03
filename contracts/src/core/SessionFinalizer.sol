// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ISessionFinalizer} from "../interfaces/ISessionFinalizer.sol";

/// @title SessionFinalizer
/// @notice Optional hook for Yellow session proofs.
contract SessionFinalizer is ISessionFinalizer {
    event SessionFinalized(bytes payload);

    function finalizeSession(bytes calldata payload) external override {
        emit SessionFinalized(payload);
    }
}
