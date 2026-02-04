// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {PredictionMarket} from "../src/core/PredictionMarket.sol";
import {SettlementRouter} from "../src/core/SettlementRouter.sol";
import {OracleCoordinator} from "../src/oracle/OracleCoordinator.sol";
import {CREReceiver} from "../src/oracle/CREReceiver.sol";

contract OracleFlowTest is Test {
    SettlementRouter private router;
    OracleCoordinator private coordinator;
    CREReceiver private receiver;
    PredictionMarket private market;

    address private forwarder = address(0x1234);

    function setUp() public {
        router = new SettlementRouter();
        coordinator = new OracleCoordinator();
        receiver = new CREReceiver(forwarder, address(coordinator));

        router.setOracleCoordinator(address(coordinator));
        coordinator.setCreReceiver(address(receiver));
        coordinator.setSettlementRouter(address(router));

        market = new PredictionMarket(address(router));
        market.createMarket("Will BTC be above 50k?");
    }

    function testSettlementViaCREReceiver() public {
        bytes memory report = abi.encode(address(market), uint256(0), uint8(0), uint16(9000));
        vm.prank(forwarder);
        receiver.onReport("", report);

        PredictionMarket.Market memory m = market.getMarket(0);

        assertTrue(m.settled);
        assertEq(m.confidence, 9000);
        assertEq(uint8(m.outcome), 0);
    }
}
