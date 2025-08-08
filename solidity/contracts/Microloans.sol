// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/ITroveManager.sol";
import "./interfaces/IPriceFeed.sol";
import "./dependencies/LiquityMath.sol";

import "hardhat/console.sol";

contract Microloans is Ownable2StepUpgradeable {
    using SafeERC20 for IMUSD;

    enum MicroTroveStatus {
        NonExistent,
        Active
    }
    struct MicroTrove {
        uint256 collateral;
        uint256 principal;
        MicroTroveStatus status;
    }

    IMUSD public musd;
    IBorrowerOperations public borrowerOperations;
    ITroveManager public troveManager;
    IPriceFeed public priceFeed;

    // TODO: Expose a governable function to adjust
    uint256 public minimumCollateralization;

    mapping(address => MicroTrove) public microTroves;

    // Reserved storage space that allows adding more variables without affecting
    // the storage layout of the child contracts. The convention from OpenZeppelin
    // suggests the storage space should add up to 50 slots. If more variables are
    // added in the upcoming versions one need to reduce the array size accordingly.
    // slither-disable-next-line unused-state
    uint256[50] private __gap;

    event MainTroveOpened(
        uint256 initialDebtAmount,
        uint256 initialCollateralAmount
    );

    error MicroTroveAlreadyExists();
    error CollateralizationBelowMinimum();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        IMUSD _musd,
        IBorrowerOperations _borrowerOperations,
        ITroveManager _troveManager,
        IPriceFeed _priceFeed
    ) external initializer {
        __Ownable2Step_init();
        __Ownable_init(msg.sender);

        musd = _musd;
        borrowerOperations = _borrowerOperations;
        troveManager = _troveManager;
        priceFeed = _priceFeed;

        minimumCollateralization = 1.15 * 1e18;
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

    function openMicroTrove(
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external payable {
        MicroTrove storage microTrove = microTroves[msg.sender];

        if (microTrove.status != MicroTroveStatus.NonExistent) {
            revert MicroTroveAlreadyExists();
        }

        uint256 collateralAmount = msg.value;

        microTrove.collateral = collateralAmount;
        microTrove.principal = _debtAmount;
        microTrove.status = MicroTroveStatus.Active;

        uint256 collateralization = LiquityMath._computeCR(
            collateralAmount,
            _debtAmount,
            priceFeed.fetchPrice()
        );

        console.log("collateralization = %s", collateralization);
        console.log("minimum = %s", minimumCollateralization);

        if (collateralization < minimumCollateralization) {
            revert CollateralizationBelowMinimum();
        }

        borrowerOperations.adjustTrove{value: collateralAmount}(
            0,
            _debtAmount,
            true,
            _upperHint,
            _lowerHint
        );

        musd.safeTransfer(msg.sender, _debtAmount);

        // TODO: issuance fee
        // TODO: event
    }
}
