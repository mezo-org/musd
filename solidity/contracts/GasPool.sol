// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./dependencies/CheckContract.sol";
import "./interfaces/IGasPool.sol";
import "./token/MUSD.sol";

/**
 * The purpose of this contract is to hold mUSD tokens for gas compensation:
 * https://github.com/liquity/dev#gas-compensation
 * When a borrower opens a trove, an additional 50 mUSD principal is issued,
 * and 50 mUSD is minted and sent to this contract.
 * When a borrower closes their active trove, this gas compensation is refunded:
 * 50 mUSD is burned from the this contract's balance, and the corresponding
 * 50 mUSD principal on the trove is cancelled.
 * See this issue for more context: https://github.com/liquity/dev/issues/186
 */
contract GasPool is CheckContract, IGasPool, OwnableUpgradeable {
    address public troveManagerAddress;
    IMUSD public musdToken;

    function initialize() external initializer {
        __Ownable_init(msg.sender);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function setAddresses(
        address _musdTokenAddress,
        address _troveManagerAddress
    ) external onlyOwner {
        checkContract(_musdTokenAddress);
        checkContract(_troveManagerAddress);

        musdToken = IMUSD(_musdTokenAddress);
        // slither-disable-next-line missing-zero-check
        troveManagerAddress = _troveManagerAddress;

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
            "GasPool: sending mUSD failed"
        );
    }
}
