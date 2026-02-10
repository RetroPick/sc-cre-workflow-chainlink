// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface ISessionFinalizer {
    function finalizeSession(bytes calldata payload) external;
}
