// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReceiverTemplate} from "./interfaces/ReceiverTemplate.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IPredictionMarket {
    function createMarketFor(string memory question, address requestedBy) external returns (uint256);
}

/// @title MarketFactory
/// @notice CRE receiver that deploys markets from validated feed inputs.
contract MarketFactory is ReceiverTemplate {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    error InvalidMarketAddress();
    error InvalidRequestedBy();
    error InvalidQuestion();
    error DuplicateExternalId();
    error ResolveTimeInPast();
    error InvalidSignature();

    event MarketSpawned(
        uint256 indexed marketId,
        address indexed requestedBy,
        string question,
        uint48 resolveTime,
        string category,
        string source,
        bytes32 externalId
    );

    struct MarketInput {
        string question;
        address requestedBy;
        uint48 resolveTime;
        string category;
        string source;
        bytes32 externalId;
        bytes signature;
    }

    struct MarketMetadata {
        address requestedBy;
        uint48 resolveTime;
        string category;
        string source;
        bytes32 externalId;
    }

    IPredictionMarket public immutable predictionMarket;
    uint256 public minQuestionLength = 10;
    uint256 public maxQuestionLength = 200;

    mapping(bytes32 => bool) public usedExternalIds;
    mapping(uint256 => MarketMetadata) public marketMetadata;

    constructor(address forwarderAddress, address predictionMarketAddress) ReceiverTemplate(forwarderAddress) {
        if (predictionMarketAddress == address(0)) revert InvalidMarketAddress();
        predictionMarket = IPredictionMarket(predictionMarketAddress);
    }

    /// @notice Update question length bounds.
    function setQuestionBounds(uint256 minLength, uint256 maxLength) external onlyOwner {
        minQuestionLength = minLength;
        maxQuestionLength = maxLength;
    }

    function _processReport(bytes calldata report) internal override {
        MarketInput memory input = abi.decode(report, (MarketInput));

        _validateInput(input);

        usedExternalIds[input.externalId] = true;

        uint256 marketId = predictionMarket.createMarketFor(input.question, input.requestedBy);
        marketMetadata[marketId] = MarketMetadata({
            requestedBy: input.requestedBy,
            resolveTime: input.resolveTime,
            category: input.category,
            source: input.source,
            externalId: input.externalId
        });

        emit MarketSpawned(
            marketId,
            input.requestedBy,
            input.question,
            input.resolveTime,
            input.category,
            input.source,
            input.externalId
        );
    }

    function _validateInput(MarketInput memory input) internal view {
        if (input.requestedBy == address(0)) revert InvalidRequestedBy();
        uint256 questionLength = bytes(input.question).length;
        if (questionLength < minQuestionLength || questionLength > maxQuestionLength) revert InvalidQuestion();
        if (input.resolveTime <= block.timestamp) revert ResolveTimeInPast();
        if (usedExternalIds[input.externalId]) revert DuplicateExternalId();

        if (input.signature.length > 0) {
            bytes32 digest = keccak256(
                abi.encodePacked(
                    address(this),
                    input.requestedBy,
                    input.question,
                    input.resolveTime,
                    input.category,
                    input.source,
                    input.externalId
                )
            ).toEthSignedMessageHash();

            address signer = ECDSA.recover(digest, input.signature);
            if (signer != input.requestedBy) revert InvalidSignature();
        }
    }
}
