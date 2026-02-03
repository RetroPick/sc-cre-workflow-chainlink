// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReceiverTemplate} from "../interfaces/ReceiverTemplate.sol";

/// @title PredictionMarket
/// @notice A simplified prediction market for CRE bootcamp.
contract PredictionMarket is ReceiverTemplate {
    error MarketDoesNotExist();
    error MarketAlreadySettled();
    error MarketNotSettled();
    error AlreadyPredicted();
    error InvalidAmount();
    error NothingToClaim();
    error AlreadyClaimed();
    error TransferFailed();
    error UnauthorizedFactory();
    error InvalidMarketType();
    error InvalidOutcomeIndex();
    error InvalidOutcomeCount();
    error InvalidTimelineWindows();

    event MarketCreated(uint256 indexed marketId, string question, address creator);
    event PredictionMade(uint256 indexed marketId, address indexed predictor, Prediction prediction, uint256 amount);
    event MarketCreatedTyped(uint256 indexed marketId, MarketType marketType, uint256 outcomesCount);
    event PredictionMadeTyped(uint256 indexed marketId, address indexed predictor, uint8 outcomeIndex, uint256 amount);
    event SettlementRequested(uint256 indexed marketId, string question);
    event MarketSettled(uint256 indexed marketId, Prediction outcome, uint16 confidence);
    event MarketSettledTyped(uint256 indexed marketId, uint8 outcomeIndex, uint16 confidence);
    event WinningsClaimed(uint256 indexed marketId, address indexed claimer, uint256 amount);
    event MarketFactoryUpdated(address indexed previousFactory, address indexed newFactory);

    enum Prediction {
        Yes,
        No
    }

    enum MarketType {
        Binary,
        Categorical,
        Timeline
    }

    struct Market {
        address creator;
        uint48 createdAt;
        uint48 settledAt;
        bool settled;
        uint16 confidence;
        Prediction outcome;
        uint256 totalYesPool;
        uint256 totalNoPool;
        string question;
    }

    struct UserPrediction {
        uint256 amount;
        Prediction prediction;
        bool claimed;
    }

    struct TypedPrediction {
        uint256 amount;
        uint8 outcomeIndex;
        bool claimed;
    }

    uint256 internal nextMarketId;
    mapping(uint256 marketId => Market market) internal markets;
    mapping(uint256 marketId => mapping(address user => UserPrediction)) internal predictions;
    mapping(uint256 marketId => mapping(address user => TypedPrediction)) internal typedPredictions;
    mapping(uint256 marketId => MarketType) public marketTypeById;
    mapping(uint256 marketId => string[]) internal categoricalOutcomes;
    mapping(uint256 marketId => uint256[]) internal categoricalPools;
    mapping(uint256 marketId => uint48[]) internal timelineWindows;
    mapping(uint256 marketId => uint256[]) internal timelinePools;
    mapping(uint256 marketId => uint8) public typedOutcomeIndex;
    address public marketFactory;

    /// @notice Constructor sets the Chainlink Forwarder address for security
    /// @param _forwarderAddress The address of the Chainlink KeystoneForwarder contract
    /// @dev For Sepolia testnet, use: 0x15fc6ae953e024d975e77382eeec56a9101f9f88
    constructor(address _forwarderAddress) ReceiverTemplate(_forwarderAddress) {}

    /// @notice Set the MarketFactory address allowed to create markets on behalf of users.
    function setMarketFactory(address factory) external onlyOwner {
        address previous = marketFactory;
        marketFactory = factory;
        emit MarketFactoryUpdated(previous, factory);
    }

    // ================================================================
    // │                       Create market                          │
    // ================================================================

    /// @notice Create a new prediction market.
    /// @param question The question for the market.
    /// @return marketId The ID of the newly created market.
    function createMarket(string memory question) public returns (uint256 marketId) {
        marketId = nextMarketId++;

        marketTypeById[marketId] = MarketType.Binary;
        markets[marketId] = Market({
            creator: msg.sender,
            createdAt: uint48(block.timestamp),
            settledAt: 0,
            settled: false,
            confidence: 0,
            outcome: Prediction.Yes,
            totalYesPool: 0,
            totalNoPool: 0,
            question: question
        });

        emit MarketCreated(marketId, question, msg.sender);
    }

    /// @notice Create a market from the MarketFactory with an explicit creator.
    /// @dev Reverts if caller is not the configured MarketFactory.
    function createMarketFor(string memory question, address requestedBy) external returns (uint256 marketId) {
        if (msg.sender != marketFactory) revert UnauthorizedFactory();

        marketId = nextMarketId++;

        marketTypeById[marketId] = MarketType.Binary;
        markets[marketId] = Market({
            creator: requestedBy,
            createdAt: uint48(block.timestamp),
            settledAt: 0,
            settled: false,
            confidence: 0,
            outcome: Prediction.Yes,
            totalYesPool: 0,
            totalNoPool: 0,
            question: question
        });

        emit MarketCreated(marketId, question, requestedBy);
    }

    /// @notice Create a categorical market with multiple outcomes.
    function createCategoricalMarket(string memory question, string[] memory outcomes) external returns (uint256 marketId) {
        marketId = nextMarketId++;
        _initTypedMarket(marketId, question, msg.sender, MarketType.Categorical, outcomes.length);
        categoricalOutcomes[marketId] = outcomes;
        categoricalPools[marketId] = new uint256[](outcomes.length);
    }

    /// @notice Create a categorical market from the MarketFactory.
    function createCategoricalMarketFor(
        string memory question,
        string[] memory outcomes,
        address requestedBy
    ) external returns (uint256 marketId) {
        if (msg.sender != marketFactory) revert UnauthorizedFactory();
        marketId = nextMarketId++;
        _initTypedMarket(marketId, question, requestedBy, MarketType.Categorical, outcomes.length);
        categoricalOutcomes[marketId] = outcomes;
        categoricalPools[marketId] = new uint256[](outcomes.length);
    }

    /// @notice Create a timeline market with multiple windows.
    function createTimelineMarket(string memory question, uint48[] memory windows) external returns (uint256 marketId) {
        marketId = nextMarketId++;
        _initTypedMarket(marketId, question, msg.sender, MarketType.Timeline, windows.length);
        _storeTimelineWindows(marketId, windows);
    }

    /// @notice Create a timeline market from the MarketFactory.
    function createTimelineMarketFor(
        string memory question,
        uint48[] memory windows,
        address requestedBy
    ) external returns (uint256 marketId) {
        if (msg.sender != marketFactory) revert UnauthorizedFactory();
        marketId = nextMarketId++;
        _initTypedMarket(marketId, question, requestedBy, MarketType.Timeline, windows.length);
        _storeTimelineWindows(marketId, windows);
    }

    function _initTypedMarket(
        uint256 marketId,
        string memory question,
        address creator,
        MarketType marketType,
        uint256 outcomesCount
    ) internal {
        if (outcomesCount < 2) revert InvalidOutcomeCount();
        marketTypeById[marketId] = marketType;
        markets[marketId] = Market({
            creator: creator,
            createdAt: uint48(block.timestamp),
            settledAt: 0,
            settled: false,
            confidence: 0,
            outcome: Prediction.Yes,
            totalYesPool: 0,
            totalNoPool: 0,
            question: question
        });

        emit MarketCreated(marketId, question, creator);
        emit MarketCreatedTyped(marketId, marketType, outcomesCount);
    }

    /// @notice Store the timeline windows for a timeline market.
    /// @param marketId The ID of the market.
    /// @param windows The timeline windows.
    /// @dev Reverts if the windows are not valid.
    ///      - The windows must be sorted in ascending order.
    ///      - The windows must be at least 2.
    ///      - The windows must not be in the past.
    function _storeTimelineWindows(uint256 marketId, uint48[] memory windows) internal {
        if (windows.length < 2) revert InvalidOutcomeCount();
        for (uint256 i = 1; i < windows.length; i++) {
            if (windows[i] <= windows[i - 1]) revert InvalidTimelineWindows();
        }
        timelineWindows[marketId] = windows;
        timelinePools[marketId] = new uint256[](windows.length);
    }

    // ================================================================
    // │                          Predict                             │
    // ================================================================

    /// @notice Make a prediction on a market.
    /// @param marketId The ID of the market.
    /// @param prediction The prediction (Yes or No).
    function predict(uint256 marketId, Prediction prediction) external payable {
        Market memory m = markets[marketId];

        if (m.creator == address(0)) revert MarketDoesNotExist();
        if (m.settled) revert MarketAlreadySettled();
        if (marketTypeById[marketId] != MarketType.Binary) revert InvalidMarketType();
        if (msg.value == 0) revert InvalidAmount();

        UserPrediction memory userPred = predictions[marketId][msg.sender];
        if (userPred.amount != 0) revert AlreadyPredicted();

        predictions[marketId][msg.sender] = UserPrediction({
            amount: msg.value,
            prediction: prediction,
            claimed: false
        });

        if (prediction == Prediction.Yes) {
            markets[marketId].totalYesPool += msg.value;
        } else {
            markets[marketId].totalNoPool += msg.value;
        }

        emit PredictionMade(marketId, msg.sender, prediction, msg.value);
    }

    /// @notice Make a prediction on a categorical or timeline market.
    function predictOutcome(uint256 marketId, uint8 outcomeIndex) external payable {
        Market memory m = markets[marketId];

        if (m.creator == address(0)) revert MarketDoesNotExist();
        if (m.settled) revert MarketAlreadySettled();
        if (marketTypeById[marketId] == MarketType.Binary) revert InvalidMarketType();
        if (msg.value == 0) revert InvalidAmount();

        TypedPrediction memory userPred = typedPredictions[marketId][msg.sender];
        if (userPred.amount != 0) revert AlreadyPredicted();

        if (marketTypeById[marketId] == MarketType.Categorical) {
            if (outcomeIndex >= categoricalPools[marketId].length) revert InvalidOutcomeIndex();
            categoricalPools[marketId][outcomeIndex] += msg.value;
        } else {
            if (outcomeIndex >= timelinePools[marketId].length) revert InvalidOutcomeIndex();
            timelinePools[marketId][outcomeIndex] += msg.value;
        }

        typedPredictions[marketId][msg.sender] = TypedPrediction({
            amount: msg.value,
            outcomeIndex: outcomeIndex,
            claimed: false
        });

        emit PredictionMadeTyped(marketId, msg.sender, outcomeIndex, msg.value);
    }

    // ================================================================
    // │                    Request settlement                        │
    // ================================================================

    /// @notice Request settlement for a market.
    /// @dev Emits SettlementRequested event for CRE Log Trigger.
    /// @param marketId The ID of the market to settle.
    function requestSettlement(uint256 marketId) external {
        Market memory m = markets[marketId];

        if (m.creator == address(0)) revert MarketDoesNotExist();
        if (m.settled) revert MarketAlreadySettled();

        emit SettlementRequested(marketId, m.question);
    }

    // ================================================================
    // │                 Market settlement by CRE                     │
    // ================================================================

    /// @notice Settles a market from a CRE report with AI-determined outcome.
    /// @dev Called via onReport → _processReport when prefix byte is 0x01.
    /// @param report ABI-encoded (uint256 marketId, uint8 outcomeIndex, uint16 confidence)
    function _settleMarket(bytes calldata report) internal {
        (uint256 marketId, uint8 outcomeIndex, uint16 confidence) = abi.decode(
            report,
            (uint256, uint8, uint16)
        );

        Market memory m = markets[marketId];

        if (m.creator == address(0)) revert MarketDoesNotExist();
        if (m.settled) revert MarketAlreadySettled();

        markets[marketId].settled = true;
        markets[marketId].confidence = confidence;
        markets[marketId].settledAt = uint48(block.timestamp);
        if (marketTypeById[marketId] == MarketType.Binary) {
            if (outcomeIndex > 1) revert InvalidOutcomeIndex();
            markets[marketId].outcome = Prediction(outcomeIndex);
            emit MarketSettled(marketId, Prediction(outcomeIndex), confidence);
        } else {
            if (marketTypeById[marketId] == MarketType.Categorical) {
                if (outcomeIndex >= categoricalPools[marketId].length) revert InvalidOutcomeIndex();
            } else if (marketTypeById[marketId] == MarketType.Timeline) {
                if (outcomeIndex >= timelinePools[marketId].length) revert InvalidOutcomeIndex();
            } else {
                revert InvalidMarketType();
            }
            typedOutcomeIndex[marketId] = outcomeIndex;
            emit MarketSettledTyped(marketId, outcomeIndex, confidence);
        }
    }

    // ================================================================
    // │                      CRE Entry Point                         │
    // ================================================================

    /// @inheritdoc ReceiverTemplate
    /// @dev Routes to either market creation or settlement based on prefix byte.
    ///      - No prefix → Create market (Day 1)
    ///      - Prefix 0x01 → Settle market (Day 2)
    function _processReport(bytes calldata report) internal override {
        if (report.length > 0 && report[0] == 0x01) {
            _settleMarket(report[1:]);
        } else {
            string memory question = abi.decode(report, (string));
            createMarket(question);
        }
    }

    // ================================================================
    // │                      Claim winnings                          │
    // ================================================================

    /// @notice Claim winnings after market settlement.
    /// @param marketId The ID of the market.
    function claim(uint256 marketId) external {
        Market memory m = markets[marketId];

        if (m.creator == address(0)) revert MarketDoesNotExist();
        if (!m.settled) revert MarketNotSettled();

        if (marketTypeById[marketId] == MarketType.Binary) {
            UserPrediction memory userPred = predictions[marketId][msg.sender];

            if (userPred.amount == 0) revert NothingToClaim();
            if (userPred.claimed) revert AlreadyClaimed();
            if (userPred.prediction != m.outcome) revert NothingToClaim();

            predictions[marketId][msg.sender].claimed = true;

            uint256 totalPoolBinary = m.totalYesPool + m.totalNoPool;
            uint256 winningPoolBinary = m.outcome == Prediction.Yes ? m.totalYesPool : m.totalNoPool;
            if (winningPoolBinary == 0) revert NothingToClaim();
            uint256 payoutBinary = (userPred.amount * totalPoolBinary) / winningPoolBinary;

            (bool successBinary,) = msg.sender.call{value: payoutBinary}("");
            if (!successBinary) revert TransferFailed();

            emit WinningsClaimed(marketId, msg.sender, payoutBinary);
            return;
        }

        TypedPrediction memory typedPred = typedPredictions[marketId][msg.sender];
        if (typedPred.amount == 0) revert NothingToClaim();
        if (typedPred.claimed) revert AlreadyClaimed();
        if (typedPred.outcomeIndex != typedOutcomeIndex[marketId]) revert NothingToClaim();

        typedPredictions[marketId][msg.sender].claimed = true;

        uint256 totalPool = 0;
        uint256 winningPool = 0;
        if (marketTypeById[marketId] == MarketType.Categorical) {
            uint256[] storage pools = categoricalPools[marketId];
            for (uint256 i = 0; i < pools.length; i++) {
                totalPool += pools[i];
            }
            winningPool = pools[typedOutcomeIndex[marketId]];
        } else if (marketTypeById[marketId] == MarketType.Timeline) {
            uint256[] storage pools = timelinePools[marketId];
            for (uint256 i = 0; i < pools.length; i++) {
                totalPool += pools[i];
            }
            winningPool = pools[typedOutcomeIndex[marketId]];
        } else {
            revert InvalidMarketType();
        }

        if (winningPool == 0) revert NothingToClaim();
        uint256 payout = (typedPred.amount * totalPool) / winningPool;

        (bool success,) = msg.sender.call{value: payout}("");
        if (!success) revert TransferFailed();

        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    // ================================================================
    // │                          Getters                             │
    // ================================================================

    /// @notice Get market details.
    /// @param marketId The ID of the market.
    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    /// @notice Get user's prediction for a market.
    /// @param marketId The ID of the market.
    /// @param user The user's address.
    function getPrediction(uint256 marketId, address user) external view returns (UserPrediction memory) {
        return predictions[marketId][user];
    }

    function getMarketType(uint256 marketId) external view returns (MarketType) {
        return marketTypeById[marketId];
    }

    function getCategoricalOutcomes(uint256 marketId) external view returns (string[] memory) {
        return categoricalOutcomes[marketId];
    }

    function getTimelineWindows(uint256 marketId) external view returns (uint48[] memory) {
        return timelineWindows[marketId];
    }

    function getCategoricalPools(uint256 marketId) external view returns (uint256[] memory) {
        return categoricalPools[marketId];
    }

    function getTimelinePools(uint256 marketId) external view returns (uint256[] memory) {
        return timelinePools[marketId];
    }

    function getTypedPrediction(uint256 marketId, address user) external view returns (TypedPrediction memory) {
        return typedPredictions[marketId][user];
    }
}
