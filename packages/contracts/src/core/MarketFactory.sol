// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReceiverTemplate} from "../interfaces/ReceiverTemplate.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IPredictionMarket {
    function createMarketFor(string memory question, address requestedBy) external returns (uint256);
    function createCategoricalMarketFor(string memory question, string[] memory outcomes, address requestedBy) external returns (uint256);
    function createTimelineMarketFor(string memory question, uint48[] memory windows, address requestedBy) external returns (uint256);
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
    error InvalidMarketType();
    error InvalidOutcomeCount();
    error InvalidTimelineWindows();

    event MarketSpawned(
        uint256 indexed marketId,
        address indexed requestedBy,
        string question,
        uint48 resolveTime,
        string category,
        string source,
        bytes32 externalId
    );
    event MarketSpawnedTyped(
        uint256 indexed marketId,
        address indexed requestedBy,
        uint8 marketType,
        uint256 outcomesCount,
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

    struct MarketInputV2 {
        string question;
        address requestedBy;
        uint48 resolveTime;
        string category;
        string source;
        bytes32 externalId;
        uint8 marketType;
        string[] outcomes;
        uint48[] timelineWindows;
        bytes signature;
    }

    struct MarketMetadata {
        address requestedBy;
        uint48 resolveTime;
        string category;
        string source;
        bytes32 externalId;
        uint8 marketType;
        uint8 outcomesCount;
    }

    IPredictionMarket public immutable PREDICTION_MARKET;
    uint256 public minQuestionLength = 10;
    uint256 public maxQuestionLength = 200;

    mapping(bytes32 => bool) public usedExternalIds;
    mapping(uint256 => MarketMetadata) public marketMetadata;

    uint8 public constant MARKET_TYPE_BINARY = 0;
    uint8 public constant MARKET_TYPE_CATEGORICAL = 1;
    uint8 public constant MARKET_TYPE_TIMELINE = 2;

    constructor(address forwarderAddress, address predictionMarketAddress) ReceiverTemplate(forwarderAddress) {
        if (predictionMarketAddress == address(0)) revert InvalidMarketAddress();
        PREDICTION_MARKET = IPredictionMarket(predictionMarketAddress);
    }

    /// @notice Update question length bounds.
    function setQuestionBounds(uint256 minLength, uint256 maxLength) external onlyOwner {
        minQuestionLength = minLength;
        maxQuestionLength = maxLength;
    }

    function _processReport(bytes calldata report) internal override {
        if (report.length > 0 && report[0] == 0x02) {
            MarketInputV2 memory inputV2 = abi.decode(report[1:], (MarketInputV2));
            _validateInputV2(inputV2);
            usedExternalIds[inputV2.externalId] = true;

            uint256 marketIdV2 = _createTypedMarket(inputV2);
            marketMetadata[marketIdV2] = MarketMetadata({
                requestedBy: inputV2.requestedBy,
                resolveTime: inputV2.resolveTime,
                category: inputV2.category,
                source: inputV2.source,
                externalId: inputV2.externalId,
                marketType: inputV2.marketType,
                outcomesCount: _outcomesCount(inputV2)
            });

            emit MarketSpawned(
                marketIdV2,
                inputV2.requestedBy,
                inputV2.question,
                inputV2.resolveTime,
                inputV2.category,
                inputV2.source,
                inputV2.externalId
            );
            emit MarketSpawnedTyped(
                marketIdV2,
                inputV2.requestedBy,
                inputV2.marketType,
                _outcomesCount(inputV2),
                inputV2.externalId
            );
            return;
        }

        MarketInput memory input = abi.decode(report, (MarketInput));
        _validateInput(input);
        usedExternalIds[input.externalId] = true;

        uint256 marketId = PREDICTION_MARKET.createMarketFor(input.question, input.requestedBy);
        marketMetadata[marketId] = MarketMetadata({
            requestedBy: input.requestedBy,
            resolveTime: input.resolveTime,
            category: input.category,
            source: input.source,
            externalId: input.externalId,
            marketType: MARKET_TYPE_BINARY,
            outcomesCount: 2
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

    function _validateInputV2(MarketInputV2 memory input) internal view {
        if (input.requestedBy == address(0)) revert InvalidRequestedBy();
        uint256 questionLength = bytes(input.question).length;
        if (questionLength < minQuestionLength || questionLength > maxQuestionLength) revert InvalidQuestion();
        if (input.resolveTime <= block.timestamp) revert ResolveTimeInPast();
        if (usedExternalIds[input.externalId]) revert DuplicateExternalId();

        if (input.marketType == MARKET_TYPE_CATEGORICAL) {
            if (input.outcomes.length < 2) revert InvalidOutcomeCount();
        } else if (input.marketType == MARKET_TYPE_TIMELINE) {
            if (input.timelineWindows.length < 2) revert InvalidOutcomeCount();
            for (uint256 i = 1; i < input.timelineWindows.length; i++) {
                if (input.timelineWindows[i] <= input.timelineWindows[i - 1]) revert InvalidTimelineWindows();
            }
        } else if (input.marketType != MARKET_TYPE_BINARY) {
            revert InvalidMarketType();
        }

        if (input.signature.length > 0) {
            // forge-lint: disable-next-line(asm-keccak256)
            bytes32 outcomesHash = keccak256(abi.encode(input.outcomes));
            // forge-lint: disable-next-line(asm-keccak256)
            bytes32 windowsHash = keccak256(abi.encode(input.timelineWindows));
            bytes32 digest = keccak256(
                abi.encodePacked(
                    address(this),
                    input.requestedBy,
                    input.question,
                    input.resolveTime,
                    input.category,
                    input.source,
                    input.externalId,
                    input.marketType,
                    outcomesHash,
                    windowsHash
                )
            ).toEthSignedMessageHash();

            address signer = ECDSA.recover(digest, input.signature);
            if (signer != input.requestedBy) revert InvalidSignature();
        }
    }

    function _createTypedMarket(MarketInputV2 memory input) internal returns (uint256) {
        if (input.marketType == MARKET_TYPE_BINARY) {
            return PREDICTION_MARKET.createMarketFor(input.question, input.requestedBy);
        }
        if (input.marketType == MARKET_TYPE_CATEGORICAL) {
            return PREDICTION_MARKET.createCategoricalMarketFor(input.question, input.outcomes, input.requestedBy);
        }
        if (input.marketType == MARKET_TYPE_TIMELINE) {
            return PREDICTION_MARKET.createTimelineMarketFor(input.question, input.timelineWindows, input.requestedBy);
        }
        revert InvalidMarketType();
    }

    function _outcomesCount(MarketInputV2 memory input) internal pure returns (uint8) {
        if (input.marketType == MARKET_TYPE_TIMELINE) {
            return uint8(input.timelineWindows.length);
        }
        if (input.marketType == MARKET_TYPE_CATEGORICAL) {
            return uint8(input.outcomes.length);
        }
        return 2;
    }
}
