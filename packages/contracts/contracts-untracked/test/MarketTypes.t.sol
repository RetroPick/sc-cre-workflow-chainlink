// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PredictionMarket} from "../src/core/PredictionMarket.sol";
import {MarketFactory} from "../src/core/MarketFactory.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

contract MarketTypesTest is Test {
    PredictionMarket private market;
    MarketFactory private factory;
    ERC20Mock private token;
    address private forwarder = address(0x1234);
    address private creator = address(0xBEEF);
    address private user = address(0xCAFE);
    address private constant TOKEN_ADDRESS = 0x3600000000000000000000000000000000000000;

    function setUp() public {
        vm.warp(1000);
        market = new PredictionMarket(forwarder);
        factory = new MarketFactory(forwarder, address(market));
        market.setMarketFactory(address(factory));

        ERC20Mock deployed = new ERC20Mock();
        vm.etch(TOKEN_ADDRESS, address(deployed).code);
        token = ERC20Mock(TOKEN_ADDRESS);
    }

    function testCategoricalMarketCreation() public {
        string[] memory outcomes = new string[](3);
        outcomes[0] = "A";
        outcomes[1] = "B";
        outcomes[2] = "C";

        // #region agent log
        vm.writeLine(
            "/home/asyam321/Project/RetroPick/RetroPick/.cursor/debug.log",
            string(
                abi.encodePacked(
                    '{"sessionId":"debug-session","runId":"post-fix","hypothesisId":"A","location":"MarketTypes.t.sol:testCategoricalMarketCreation:setup","message":"initial addresses","data":{"market":"',
                    vm.toString(address(market)),
                    '","user":"',
                    vm.toString(user),
                    '","testCaller":"',
                    vm.toString(address(this)),
                    '"},"timestamp":',
                    vm.toString(block.timestamp),
                    "}"
                )
            )
        );
        // #endregion

        MarketFactory.MarketInputV2 memory input = MarketFactory.MarketInputV2({
            question: "Which team wins?",
            requestedBy: creator,
            resolveTime: uint48(block.timestamp + 1000),
            category: "sports",
            source: "demo",
            // casting to bytes32 is safe for short ASCII ids
            // forge-lint: disable-next-line(unsafe-typecast)
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

        token.mint(user, 1 ether);
        vm.startPrank(user);
        token.approve(address(market), 0.1 ether);
        // #region agent log
        vm.writeLine(
            "/home/asyam321/Project/RetroPick/RetroPick/.cursor/debug.log",
            string(
                abi.encodePacked(
                    '{"sessionId":"debug-session","runId":"post-fix","hypothesisId":"B","location":"MarketTypes.t.sol:testCategoricalMarketCreation:afterApprove","message":"allowances after approve","data":{"allowUserToMarket":"',
                    vm.toString(token.allowance(user, address(market))),
                    '","allowTestToMarket":"',
                    vm.toString(token.allowance(address(this), address(market))),
                    '"},"timestamp":',
                    vm.toString(block.timestamp),
                    "}"
                )
            )
        );
        // #endregion

        // #region agent log
        vm.writeLine(
            "/home/asyam321/Project/RetroPick/RetroPick/.cursor/debug.log",
            string(
                abi.encodePacked(
                    '{"sessionId":"debug-session","runId":"post-fix","hypothesisId":"A","location":"MarketTypes.t.sol:testCategoricalMarketCreation:beforePredict","message":"caller before predictOutcome","data":{"msgSender":"',
                    vm.toString(msg.sender),
                    '"},"timestamp":',
                    vm.toString(block.timestamp),
                    "}"
                )
            )
        );
        // #endregion
        market.predictOutcome(0, 1, 0.1 ether);
        vm.stopPrank();
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
            // casting to bytes32 is safe for short ASCII ids
            // forge-lint: disable-next-line(unsafe-typecast)
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
