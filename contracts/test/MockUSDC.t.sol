// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC token;
    address treasury = makeAddr("treasury");
    address wallet = makeAddr("wallet");

    function setUp() public {
        token = new MockUSDC(treasury);
    }

    function test_hasSixDecimals() public view {
        assertEq(token.decimals(), 6);
    }

    function test_ownerMints() public {
        vm.prank(treasury);
        token.mint(treasury, 1_000e6);
        assertEq(token.balanceOf(treasury), 1_000e6);
    }

    function test_nonOwnerCannotMint() public {
        vm.prank(wallet);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, wallet));
        token.mint(wallet, 1e6);
    }

    // ---------------------------------------------------------------- eventos

    function test_mintEmitsTransferFromZero() public {
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(address(0), wallet, 5e6);
        vm.prank(treasury);
        token.mint(wallet, 5e6);
    }

    function test_transferEmitsTransfer() public {
        vm.prank(treasury);
        token.mint(treasury, 10e6);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(treasury, wallet, 1_230_000);
        vm.prank(treasury);
        token.transfer(wallet, 1_230_000);
    }

    // ------------------------------------------------------------------ erros

    function test_mintToZeroAddressReverts() public {
        vm.prank(treasury);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        token.mint(address(0), 1e6);
    }

    function test_ownerCanHandOverMinting() public {
        vm.prank(treasury);
        token.transferOwnership(wallet);
        vm.prank(treasury);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, treasury));
        token.mint(treasury, 1e6);
        vm.prank(wallet);
        token.mint(wallet, 1e6);
        assertEq(token.balanceOf(wallet), 1e6);
    }

    // ------------------------------------------------------------------- fuzz

    /// Qualquer valor emitido pelo owner vai inteiro ao destino e entra no supply, com o evento certo.
    function testFuzz_ownerMintsExactAmount(address to, uint256 amount) public {
        vm.assume(to != address(0));
        amount = bound(amount, 0, type(uint128).max);
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(address(0), to, amount);
        vm.prank(treasury);
        token.mint(to, amount);
        assertEq(token.balanceOf(to), amount);
        assertEq(token.totalSupply(), amount);
    }

    /// Ninguém além do owner emite, qualquer que seja o chamador e o valor.
    function testFuzz_nonOwnerCannotMint(address caller, address to, uint256 amount) public {
        vm.assume(caller != treasury);
        vm.assume(to != address(0));
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        token.mint(to, amount);
        assertEq(token.totalSupply(), 0);
    }

    /// Transferência move exatamente `amount`: a soma dos saldos e o supply não mudam.
    function testFuzz_transferConservesSupply(address to, uint256 minted, uint256 amount) public {
        vm.assume(to != address(0) && to != treasury);
        minted = bound(minted, 0, type(uint128).max);
        amount = bound(amount, 0, minted);
        vm.prank(treasury);
        token.mint(treasury, minted);

        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Transfer(treasury, to, amount);
        vm.prank(treasury);
        assertTrue(token.transfer(to, amount));

        assertEq(token.balanceOf(treasury), minted - amount);
        assertEq(token.balanceOf(to), amount);
        assertEq(token.totalSupply(), minted);
    }

    /// Transferir mais do que o saldo reverte e não altera nada.
    function testFuzz_transferAboveBalanceReverts(uint256 minted, uint256 extra) public {
        minted = bound(minted, 0, type(uint128).max);
        extra = bound(extra, 1, type(uint128).max);
        vm.prank(treasury);
        token.mint(treasury, minted);

        vm.prank(treasury);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, treasury, minted, minted + extra)
        );
        token.transfer(wallet, minted + extra);

        assertEq(token.balanceOf(treasury), minted);
        assertEq(token.balanceOf(wallet), 0);
    }

    /// Valores com as 6 casas (centavos de micro) são exatos: não há arredondamento no token.
    function testFuzz_sixDecimalAmountsAreExact(uint64 micro) public {
        vm.prank(treasury);
        token.mint(treasury, micro);
        vm.prank(treasury);
        token.transfer(wallet, micro);
        assertEq(token.balanceOf(wallet), micro);
        assertEq(token.balanceOf(treasury), 0);
    }

    function test_standardTransfer() public {
        vm.prank(treasury);
        token.mint(treasury, 10e6);
        vm.prank(treasury);
        token.transfer(wallet, 1_230_000);
        assertEq(token.balanceOf(wallet), 1_230_000);
        assertEq(token.balanceOf(treasury), 8_770_000);
    }
}
