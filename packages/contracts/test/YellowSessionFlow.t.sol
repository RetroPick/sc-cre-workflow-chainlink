// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {SessionFinalizer} from "../src/core/SessionFinalizer.sol";
import {SettlementRouter} from "../src/core/SettlementRouter.sol";
import {OracleCoordinator} from "../src/oracle/OracleCoordinator.sol";
import {CREReceiver} from "../src/oracle/CREReceiver.sol";

contract YellowSessionFlowTest is Test {
    using MessageHashUtils for bytes32;

    ERC20Mock private token;
    SessionFinalizer private finalizer;
    SettlementRouter private router;
    OracleCoordinator private coordinator;
    CREReceiver private receiver;

    address private forwarder = address(0x1234);

    uint256 private backendPk = 0xA11CE;
    address private backendSigner;

    uint256 private userPk1 = 0xB0B;
    uint256 private userPk2 = 0xC0FFEE;
    address private user1;
    address private user2;

    function setUp() public {
        backendSigner = vm.addr(backendPk);
        user1 = vm.addr(userPk1);
        user2 = vm.addr(userPk2);

        token = new ERC20Mock();
        finalizer = new SessionFinalizer(address(token), backendSigner);

        router = new SettlementRouter();
        coordinator = new OracleCoordinator();
        receiver = new CREReceiver(forwarder, address(coordinator));

        router.setOracleCoordinator(address(coordinator));
        router.setSessionFinalizer(address(finalizer));
        coordinator.setCreReceiver(address(receiver));
        coordinator.setSettlementRouter(address(router));
    }

    function testSessionFinalizationViaCREReceiver() public {
        uint256 marketId = 1;
        // casting to bytes32 is safe for short ASCII ids
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes32 sessionId = bytes32("yellow-session-1");

        address[] memory participants = new address[](2);
        participants[0] = user1;
        participants[1] = user2;

        uint256[] memory balances = new uint256[](2);
        balances[0] = 2 ether;
        balances[1] = 3 ether;

        bytes[] memory signatures = new bytes[](2);
        signatures[0] = _signUser(marketId, sessionId, user1, balances[0], userPk1);
        signatures[1] = _signUser(marketId, sessionId, user2, balances[1], userPk2);

        bytes32 stateHash = keccak256(abi.encode(marketId, sessionId, participants, balances)).toEthSignedMessageHash();
        bytes memory backendSig = _signHash(stateHash, backendPk);

        SessionFinalizer.SessionPayload memory payload = SessionFinalizer.SessionPayload({
            marketId: marketId,
            sessionId: sessionId,
            participants: participants,
            balances: balances,
            signatures: signatures,
            backendSignature: backendSig
        });

        token.mint(address(finalizer), 10 ether);

        bytes memory report = bytes.concat(bytes1(0x03), abi.encode(payload));
        vm.prank(forwarder);
        receiver.onReport("", report);

        assertEq(token.balanceOf(user1), balances[0]);
        assertEq(token.balanceOf(user2), balances[1]);
    }

    function _signUser(
        uint256 marketId,
        bytes32 sessionId,
        address participant,
        uint256 balance,
        uint256 pk
    ) internal returns (bytes memory) {
        bytes32 userHash = keccak256(abi.encode(marketId, sessionId, participant, balance)).toEthSignedMessageHash();
        return _signHash(userHash, pk);
    }

    function _signHash(bytes32 digest, uint256 pk) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}
