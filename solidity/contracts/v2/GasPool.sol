// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./dependencies/CheckContract.sol";
import "./interfaces/IGasPool.sol";
import "../token/MUSD.sol";

/**
 * The purpose of this contract is to hold THUSD tokens for gas compensation:
 * https://github.com/liquity/dev#gas-compensation
 * When a borrower opens a trove, an additional 50 THUSD debt is issued,
 * and 50 THUSD is minted and sent to this contract.
 * When a borrower closes their active trove, this gas compensation is refunded:
 * 50 THUSD is burned from the this contract's balance, and the corresponding
 * 50 THUSD debt on the trove is cancelled.
 * See this issue for more context: https://github.com/liquity/dev/issues/186
 */
contract GasPool is Ownable, CheckContract, IGasPool {
    address public troveManagerAddress;
    IMUSD public musdToken;

    constructor() Ownable(msg.sender) {}

    function setAddresses(
        address _troveManagerAddress,
        address _musdTokenAddress
    ) external onlyOwner {
        checkContract(_troveManagerAddress);
        checkContract(_musdTokenAddress);

        // slither-disable-next-line missing-zero-check
        troveManagerAddress = _troveManagerAddress;
        musdToken = IMUSD(_musdTokenAddress);

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit MUSDTokenAddressChanged(_musdTokenAddress);

        renounceOwnership();
    }

    function sendMUSD(address _account, uint256 _amount) external override {
        require(
            msg.sender == troveManagerAddress,
            "GasPool: Caller is not the TroveManager"
        );
        require(
            musdToken.transfer(_account, _amount),
            "GasPool: sending MUSD failed"
        );
    }
}
