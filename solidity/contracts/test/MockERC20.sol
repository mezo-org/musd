// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Collateral", "MCOLL") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
