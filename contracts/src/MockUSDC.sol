// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Token de teste (Sepolia) que imita o USDC: 6 casas decimais.
/// Só o owner (a tesouraria da PoC) pode emitir. Sem valor real.
contract MockUSDC is ERC20, Ownable {
    constructor(address initialOwner) ERC20("Mock USD Coin", "mUSDC") Ownable(initialOwner) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
