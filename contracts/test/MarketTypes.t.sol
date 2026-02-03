// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

contract MarketTypesTest is Test {
    PredictionMarket private market;
    MarketFactory private factory;
    address private forwarder = address(0x1234);
    address private creator = address(0xBEEF);
    address private user = address(0xCAFE);

    function setUp() public {
        vm.warp(1000);
        market = new PredictionMarket(forwarder);
        factory = new MarketFactory(forwarder, address(market));
        market.setMarketFactory(address(factory));
    }

    function testCategoricalMarketCreation() public {
        string[] memory outcomes = new string[](3);
        outcomes[0] = "A";
        outcomes[1] = "B";
        outcomes[2] = "C";

        MarketFactory.MarketInputV2 memory input = MarketFactory.MarketInputV2({
            question: "Which team wins?",
            requestedBy: creator,
            resolveTime: uint48(block.timestamp + 1000),
            category: "sports",
            source: "demo",
            externalId: bytes32("cat-1"),
            marketType: 1,
            outcomes: outcomes,
            timelineWindows: new uint48[](0),
            signature: ""
        });

        bytes memory report = bytes.concat(bytes1(0x02), abi.encode(input));
        vm.prank(forwarder);
        factory.onReport("", report);

        assertEq(uint8(market.getMarketType(0)), 1);
        string[] memory stored = market.getCategoricalOutcomes(0);
        assertEq(stored.length, 3);

        vm.deal(user, 1 ether);
        vm.prank(user);
        market.predictOutcome{value: 0.1 ether}(0, 1);
        uint256[] memory pools = market.getCategoricalPools(0);
        assertEq(pools[1], 0.1 ether);
    }

    function testTimelineMarketCreation() public {
        uint48[] memory windows = new uint48[](2);
        windows[0] = uint48(block.timestamp + 1000);
        windows[1] = uint48(block.timestamp + 2000);

        MarketFactory.MarketInputV2 memory input = MarketFactory.MarketInputV2({
            question: "When will the event happen?",
            requestedBy: creator,
            resolveTime: uint48(block.timestamp + 2500),
            category: "timeline",
            source: "demo",
            externalId: bytes32("time-1"),
            marketType: 2,
            outcomes: new string[](0),
            timelineWindows: windows,
            signature: ""
        });

        bytes memory report = bytes.concat(bytes1(0x02), abi.encode(input));
        vm.prank(forwarder);
        factory.onReport("", report);

        assertEq(uint8(market.getMarketType(0)), 2);
        uint48[] memory stored = market.getTimelineWindows(0);
        assertEq(stored.length, 2);
    }
}
