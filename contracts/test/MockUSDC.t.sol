// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
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

    function test_standardTransfer() public {
        vm.prank(treasury);
        token.mint(treasury, 10e6);
        vm.prank(treasury);
        token.transfer(wallet, 1_230_000);
        assertEq(token.balanceOf(wallet), 1_230_000);
        assertEq(token.balanceOf(treasury), 8_770_000);
    }
}
