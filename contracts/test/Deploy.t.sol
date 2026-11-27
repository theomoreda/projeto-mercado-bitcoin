// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// Testa o script de deploy como a tesouraria o executaria: quem chama `run()` vira owner.
contract DeployTest is Test {
    Deploy script;

    function setUp() public {
        script = new Deploy();
    }

    function _assertDeployedForCaller() internal {
        MockUSDC token = script.run();
        assertEq(token.owner(), address(this), "owner deve ser quem assina o deploy");
        assertEq(token.decimals(), 6);
        assertEq(token.symbol(), "mUSDC");
        assertEq(token.totalSupply(), 0, "deploy nao emite nada");
    }

    function test_deploysOnAnvil() public {
        vm.chainId(31337);
        _assertDeployedForCaller();
    }

    function test_deploysOnSepolia() public {
        vm.chainId(11155111);
        _assertDeployedForCaller();
    }

    function test_revertsOnMainnet() public {
        vm.chainId(1);
        vm.expectRevert(bytes("Deploy permitido so na Sepolia ou no Anvil"));
        script.run();
    }

    /// Qualquer outra rede (L2s, Holesky, etc.) também é recusada.
    function testFuzz_revertsOnAnyOtherChain(uint64 chainId) public {
        vm.assume(chainId != 31337 && chainId != 11155111 && chainId != 0);
        vm.chainId(chainId);
        vm.expectRevert(bytes("Deploy permitido so na Sepolia ou no Anvil"));
        script.run();
    }
}
