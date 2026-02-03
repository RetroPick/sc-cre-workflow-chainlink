// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PredictionMarket} from "../src/core/PredictionMarket.sol";
import {MarketFactory} from "../src/core/MarketFactory.sol";
import {console} from "forge-std/console.sol";

contract MarketTypesTest is Test {
    PredictionMarket private market;
    MarketFactory private factory;
    address private forwarder = address(0x1234);
    address private creator = address(0xBEEF);
    address private user = address(0xCAFE);

    function setUp() public {
        console.log("MarketTypesTest.setUp: start");
        vm.warp(1000);
        market = new PredictionMarket(forwarder);
        factory = new MarketFactory(forwarder, address(market));
        market.setMarketFactory(address(factory));
        console.log("MarketTypesTest.setUp: factory configured");
    }

    function testCategoricalMarketCreation() public {
        console.log("testCategoricalMarketCreation: build outcomes");
        string[] memory outcomes = new string[](3);
        outcomes[0] = "A";
        outcomes[1] = "B";
        outcomes[2] = "C";

        console.log("testCategoricalMarketCreation: build input");
        MarketFactory.MarketInputV2 memory input = MarketFactory.MarketInputV2({
            question: "Which team wins?",
            requestedBy: creator,
            resolveTime: uint48(block.timestamp + 1000),
            category: "sports",
            source: "demo",
            // casting to bytes32 is safe because the literal fits in 32 bytes
            // forge-lint: disable-next-line(unsafe-typecast)
            externalId: bytes32("cat-1"),
            marketType: 1,
            outcomes: outcomes,
            timelineWindows: new uint48[](0),
            signature: ""
        });

        console.log("testCategoricalMarketCreation: send report");
        bytes memory report = bytes.concat(bytes1(0x02), abi.encode(input));
        vm.prank(forwarder);
        factory.onReport("", report);

        console.log("testCategoricalMarketCreation: verify market type");
        assertEq(uint8(market.getMarketType(0)), 1);
        string[] memory stored = market.getCategoricalOutcomes(0);
        assertEq(stored.length, 3);

        console.log("testCategoricalMarketCreation: place prediction");
        vm.deal(user, 1 ether);
        vm.prank(user);
        market.predictOutcome{value: 0.1 ether}(0, 1);
        uint256[] memory pools = market.getCategoricalPools(0);
        assertEq(pools[1], 0.1 ether);
    }

    function testTimelineMarketCreation() public {
        console.log("testTimelineMarketCreation: build windows");
        uint48[] memory windows = new uint48[](2);
        windows[0] = uint48(block.timestamp + 1000);
        windows[1] = uint48(block.timestamp + 2000);

        console.log("testTimelineMarketCreation: build input");
        MarketFactory.MarketInputV2 memory input = MarketFactory.MarketInputV2({
            question: "When will the event happen?",
            requestedBy: creator,
            resolveTime: uint48(block.timestamp + 2500),
            category: "timeline",
            source: "demo",
            // casting to bytes32 is safe because the literal fits in 32 bytes
            // forge-lint: disable-next-line(unsafe-typecast)
            externalId: bytes32("time-1"),
            marketType: 2,
            outcomes: new string[](0),
            timelineWindows: windows,
            signature: ""
        });

        console.log("testTimelineMarketCreation: send report");
        bytes memory report = bytes.concat(bytes1(0x02), abi.encode(input));
        vm.prank(forwarder);
        factory.onReport("", report);

        console.log("testTimelineMarketCreation: verify market type");
        assertEq(uint8(market.getMarketType(0)), 2);
        uint48[] memory stored = market.getTimelineWindows(0);
        assertEq(stored.length, 2);
    }
}
