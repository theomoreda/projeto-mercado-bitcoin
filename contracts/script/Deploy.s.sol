// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --private-key "$TREASURY_PRIVATE_KEY" --broadcast
/// A conta que assina o deploy (a tesouraria) vira owner do token.
contract Deploy is Script {
    function run() external returns (MockUSDC token) {
        // Nunca mainnet: só Sepolia ou o Anvil local.
        require(block.chainid == 11155111 || block.chainid == 31337, "Deploy permitido so na Sepolia ou no Anvil");
        vm.startBroadcast();
        token = new MockUSDC(msg.sender);
        vm.stopBroadcast();
        console.log("NEXT_PUBLIC_TOKEN_ADDRESS=%s", address(token));
    }
}
