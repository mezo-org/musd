// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ITroveManager.sol";

contract Microloans is Ownable2StepUpgradeable {
    IBorrowerOperations public borrowerOperations;
    ITroveManager public troveManager;

    event MainTroveOpened(
        uint256 initialDebtAmount,
        uint256 initialCollateralAmount
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        IBorrowerOperations _borrowerOperations,
        ITroveManager _troveManager
    ) external initializer {
        __Ownable2Step_init();
        __Ownable_init(msg.sender);

        borrowerOperations = _borrowerOperations;
        troveManager = _troveManager;
    }

    function openMainTrove(
        uint256 _initialDebtAmount,
        address _upperHint,
        address _lowerHint
    ) external payable onlyOwner {
        emit MainTroveOpened(_initialDebtAmount, msg.value);

        borrowerOperations.openTrove{value: msg.value}(
            _initialDebtAmount,
            _upperHint,
            _lowerHint
        );
    }
}
