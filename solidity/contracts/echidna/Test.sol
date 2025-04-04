// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "../BorrowerOperations.sol";
import "../interfaces/IBorrowerOperations.sol";

contract Test {
    address[3] private callers = [
        0x2000000000000000000000000000000000000000,
        0x3000000000000000000000000000000000000000,
        0x4000000000000000000000000000000000000000
    ];

    IBorrowerOperations borrowerOperations =
        IBorrowerOperations(new BorrowerOperations());

    mapping(address => uint256) public balances;

    function airdrop() public {
        balances[msg.sender] = 1000;
    }

    function consume() public {
        require(balances[msg.sender] > 0);
        balances[msg.sender] -= 1;
    }

    function backdoor() public {
        balances[msg.sender] += 1;
    }

    function echidna_balance_under_1000() public view returns (bool) {
        for (uint i = 0; i < 3; i++) {
            if (balances[callers[i]] > 1000) {
                return false;
            }
        }
        return true;
    }
}
