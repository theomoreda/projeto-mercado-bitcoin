// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --private-key "$TREASURY_PRIVATE_KEY" --broadcast
/// A conta que assina o deploy (a tesouraria) vira owner do token.
contract Deploy is Script {
    function run() external returns (MockUSDC token) {
        vm.startBroadcast();
        token = new MockUSDC(msg.sender);
        vm.stopBroadcast();
        console.log("NEXT_PUBLIC_TOKEN_ADDRESS=%s", address(token));
    }
}
