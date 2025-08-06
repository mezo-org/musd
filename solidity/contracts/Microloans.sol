// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ITroveManager.sol";

contract Microloans is Ownable2StepUpgradeable {
    IBorrowerOperations public borrowerOperations;
    ITroveManager public troveManager;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        IBorrowerOperations _borrowerOperations,
        ITroveManager _troveManager
    ) external initializer {
        borrowerOperations = _borrowerOperations;
        troveManager = _troveManager;
    }

    function openMainTrove(
        uint256 _initialDebtAmount,
        address _upperHint,
        address _lowerHint
    ) external payable onlyOwner {
        borrowerOperations.openTrove{value: msg.value}(
            _initialDebtAmount,
            _upperHint,
            _lowerHint
        );
    }
}
